import { useState } from 'react';
import { Clapperboard, ExternalLink, ImageIcon, Plus, Trash2 } from 'lucide-react';
import { get, mediaUrl, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { SITE_URL } from '../lib/site';
import type { MediaView } from '../lib/types';
import { MediaPicker } from '../components/Media';
import { useToast } from '../components/Toast';
import { Button, Card, CardHead, Empty, ErrorBox, Field, Input, LoadingPage, MediaImg, NumberInput, PageHead, Textarea, Toggle } from '../components/ui';

interface Chapter {
  startSec: number;
  label: string;
  place: string | null;
}
interface FilmData {
  id: string;
  label: string;
  description: string | null;
  durationSec: number;
  published: boolean;
  media: MediaView | null;
  posterMedia: MediaView | null;
  chapters: Chapter[];
  /** §SEO — what a VideoObject needs beyond the file itself. */
  transcript: string | null;
  uploadDate: string | null;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const parseClock = (v: string): number | null => {
  const m = v.trim().match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(v);
  return Number.isFinite(n) && v.trim() !== '' ? n : null;
};

/** Roadmap item 23 — the film on /film: the file, its poster and its chapters. */
export default function Film() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('content.edit');
  const { data, error, refetch } = useQuery('film', () => get<FilmData | null>('/admin/film'));
  const [draft, setDraft] = useState<FilmData | null>(null);
  const [pick, setPick] = useState<'VIDEO' | 'IMAGE' | null>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (data === undefined) return <LoadingPage />;
  const f: FilmData = draft ?? data ?? { id: '', label: 'The film', description: null, durationSec: 0, published: false, media: null, posterMedia: null, chapters: [], transcript: null, uploadDate: null };
  const set = (patchValue: Partial<FilmData>) => setDraft({ ...f, ...patchValue });

  const save = async () => {
    setBusy(true);
    try {
      await put('/admin/film', {
        label: f.label,
        description: f.description || null,
        durationSec: f.durationSec,
        published: f.published,
        mediaId: f.media?.id ?? null,
        posterMediaId: f.posterMedia?.id ?? null,
        chapters: f.chapters.filter((c) => c.label.trim()).map((c) => ({ ...c, place: c.place || null })),
        transcript: f.transcript?.trim() || null,
        uploadDate: f.uploadDate || null,
      });
      toast.success('Film saved. The website updates straight away.');
      setDraft(null);
      invalidate('film');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Film" sub="The architectural film and its chapters">
        <a className="btn" href={`${SITE_URL}/film`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View on the website</a>
        {editable && <Button variant="primary" busy={busy} disabled={!draft} onClick={() => void save()}>Save changes</Button>}
      </PageHead>
      <div className="grid-2">
        <Card pad>
          <div className="placement-media" style={{ aspectRatio: '16 / 9' }}>
            {f.media ? <video src={mediaUrl(f.media.url)} poster={mediaUrl(f.posterMedia?.url)} controls style={{ width: '100%', height: '100%' }} onLoadedMetadata={(e) => { const d = Math.round(e.currentTarget.duration * 10) / 10; if (editable && Number.isFinite(d) && Math.abs(d - f.durationSec) > 0.2) set({ durationSec: d }); }} /> : <div className="placement-empty"><Clapperboard size={28} /> No film chosen — the Film page is hidden</div>}
          </div>
          {editable && (
            <div className="row-wrap" style={{ gap: 8, marginTop: 12 }}>
              <Button icon={<Clapperboard size={15} />} onClick={() => setPick('VIDEO')}>{f.media ? 'Change film' : 'Choose film'}</Button>
              <Button icon={<ImageIcon size={15} />} onClick={() => setPick('IMAGE')}>{f.posterMedia ? 'Change poster' : 'Choose poster'}</Button>
            </div>
          )}
          {f.posterMedia && <div className="thumb" style={{ width: 160, height: 90, position: 'relative', marginTop: 12, borderRadius: 8, overflow: 'hidden' }}><MediaImg m={f.posterMedia} sizes="160px" /></div>}
        </Card>
        <Card pad>
          <Field label="Title"><Input value={f.label} disabled={!editable} onChange={(e) => set({ label: e.target.value })} /></Field>
          <Field label="Description"><Textarea rows={3} value={f.description ?? ''} disabled={!editable} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="Length (seconds)" hint="Read from the file when it loads."><NumberInput value={f.durationSec} disabled={!editable} onChange={(v) => set({ durationSec: v ?? 0 })} suffix="s" /></Field>
          <Field label="First published" hint="The date the film went online. Search engines print it beside the result.">
            <Input type="date" value={f.uploadDate ? f.uploadDate.slice(0, 10) : ''} disabled={!editable} onChange={(e) => set({ uploadDate: e.target.value || null })} />
          </Field>
          {/* §SEO — a page that is a film has no text to read. The transcript
              is the only thing a search engine can index, and it is what a
              visitor who cannot hear reads instead. */}
          <Field label="Transcript" hint="What is said in the film, as plain text. Published as structured data, not shown on the page.">
            <Textarea rows={8} value={f.transcript ?? ''} disabled={!editable} onChange={(e) => set({ transcript: e.target.value })} />
          </Field>
          <Toggle checked={f.published} disabled={!editable} onChange={(v) => set({ published: v })} label="Show the Film page on the website" />
        </Card>
      </div>
      <Card>
        <CardHead title="Chapters" sub="Each one is a jump-to point, and together they read as a transcript">
          {editable && <Button size="sm" icon={<Plus size={14} />} onClick={() => set({ chapters: [...f.chapters, { startSec: f.chapters.at(-1)?.startSec ?? 0, label: '', place: '' }] })}>Add chapter</Button>}
        </CardHead>
        {f.chapters.length === 0 && <Empty title="No chapters" />}
        {f.chapters.map((c, i) => (
          <div key={i} className="row" style={{ padding: '10px 22px', borderTop: '1px solid var(--line-2)', gap: 10 }}>
            <Input aria-label="Starts at (m:ss)" defaultValue={clock(c.startSec)} disabled={!editable} style={{ width: 90 }} onBlur={(e) => { const v = parseClock(e.target.value); if (v !== null) set({ chapters: f.chapters.map((x, j) => (j === i ? { ...x, startSec: v } : x)) }); }} />
            <Input aria-label="Chapter title" placeholder="Title" value={c.label} disabled={!editable} onChange={(e) => set({ chapters: f.chapters.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <Input aria-label="Where" placeholder="Where" value={c.place ?? ''} disabled={!editable} onChange={(e) => set({ chapters: f.chapters.map((x, j) => (j === i ? { ...x, place: e.target.value } : x)) })} />
            {editable && <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label="Remove chapter" onClick={() => set({ chapters: f.chapters.filter((_, j) => j !== i) })} />}
          </div>
        ))}
      </Card>
      {pick && <MediaPicker kind={pick} onClose={() => setPick(null)} onPick={([m]) => m && set(pick === 'VIDEO' ? { media: m } : { posterMedia: m })} />}
    </>
  );
}
