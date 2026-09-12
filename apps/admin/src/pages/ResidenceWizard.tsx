import { useState, type ReactElement } from 'react';
import { Check, ChevronLeft, ChevronRight, FileText, Film, ImagePlus, Rocket, Star, X } from 'lucide-react';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { area, money } from '../lib/format';
import { invalidate } from '../lib/query';
import { floorName, useFloors, useTypes } from '../lib/ref';
import { navigate } from '../lib/router';
import type { MediaView } from '../lib/types';
import { Dropzone, IMAGE_ACCEPT, PLAN_ACCEPT, uploadFiles, VIDEO_ACCEPT } from '../components/Media';
import {
  BasicFields,
  DescriptionFields,
  EMPTY_DRAFT,
  FeaturePicker,
  PricingFields,
  SizeFields,
  toBody,
  validate,
  type Errors,
  type ResidenceDraft,
} from '../components/ResidenceFields';
import { useToast } from '../components/Toast';
import { Alert, Button, Card, KV, PageHead, Segmented, Toggle } from '../components/ui';

const STEPS = ['Basic information', 'Size & specifications', 'Pricing', 'Media', 'Features', 'Publishing'] as const;

function FileList({ files, onRemove, icon }: { files: File[]; onRemove: (i: number) => void; icon: ReactElement }) {
  if (!files.length) return null;
  return (
    <div className="upload-list">
      {files.map((f, i) => (
        <div key={i} className="upload-item">
          {icon}
          <span style={{ flex: 1 }}>{f.name}</span>
          <span className="muted small">{Math.round(f.size / 1024)} KB</span>
          <Button size="xs" variant="ghost" icon={<X size={14} />} aria-label={`Remove ${f.name}`} onClick={() => onRemove(i)} />
        </div>
      ))}
    </div>
  );
}

/**
 * §35 — adding a residence, one step at a time. Each step is checked before
 * moving on, so errors appear beside the field that caused them. Photographs
 * are held in the browser until the residence exists, then uploaded to it.
 */
export default function ResidenceWizard() {
  const { can } = useAuth();
  const toast = useToast();
  const { data: floors } = useFloors();
  const { data: types } = useTypes();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<ResidenceDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Errors>({});
  const [images, setImages] = useState<File[]>([]);
  const [plans, setPlans] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = <K extends keyof ResidenceDraft>(k: K, v: ResidenceDraft[K]) => {
    setD((cur) => ({ ...cur, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  if (!can('residence.edit')) return <Alert tone="warn">Your role cannot add residences.</Alert>;

  const check = (i: number) => {
    const part = i === 0 ? 'basic' : i === 1 ? 'size' : i === 2 ? 'pricing' : null;
    const e = part ? validate(d, part) : {};
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const go = (i: number) => {
    for (let k = 0; k < i; k++) if (!check(k)) return setStep(k);
    setStep(i);
  };

  const finish = async () => {
    const e = validate(d);
    if (Object.keys(e).length) {
      setErrors(e);
      setStep(e.code || e.floorId || e.typologyId || e.bedrooms || e.bathrooms ? 0 : e.priceMinor || e.discountMinor || e.promoPriceMinor ? 2 : 1);
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const unit = await post<{ id: string; code: string }>('/admin/residences', toBody(d));
      const uploads: Promise<MediaView[]>[] = [];
      if (images.length) uploads.push(uploadFiles(images, { unitId: unit.id, collection: 'LIBRARY', category: 'INTERIOR' }, () => {}));
      if (plans.length) uploads.push(uploadFiles(plans, { unitId: unit.id, collection: 'FLOOR_PLAN', category: 'RESIDENCE_PLAN' }, () => {}));
      if (videos.length) uploads.push(uploadFiles(videos, { unitId: unit.id, collection: 'LIBRARY', category: 'INTERIOR' }, () => {}));
      const results = await Promise.allSettled(uploads);
      const failed = results.filter((r) => r.status === 'rejected');
      invalidate('residences', 'dashboard', 'building', 'floors', 'types');
      toast.success(`Residence ${unit.code} created${d.published ? ' and published' : ' as a draft'}.`);
      if (failed.length) toast.error(`Some files did not upload: ${(failed[0] as PromiseRejectedResult).reason?.message ?? 'unknown error'}. Add them from the residence page.`);
      navigate(`/residences/${unit.id}`);
    } catch (err) {
      setServerError((err as Error).message);
      if (/code/i.test((err as Error).message)) {
        setErrors({ code: (err as Error).message });
        setStep(0);
      }
    } finally {
      setBusy(false);
    }
  };

  const floor = floors?.find((f) => f.id === d.floorId);
  const type = types?.find((t) => t.id === d.typologyId);

  return (
    <>
      <PageHead title="Add a residence" crumbs={[{ label: 'Residences', to: '/residences' }, { label: 'New' }]} sub="Six short steps. You can change everything later." />
      <Card pad>
        <div className="steps" role="list">
          {STEPS.map((label, i) => (
            <button key={label} type="button" className="step" role="listitem" aria-current={i === step ? 'step' : undefined} data-done={i < step} onClick={() => go(i)}>
              <span className="num">{i < step ? <Check size={15} /> : i + 1}</span>
              <span className="label-text">{label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card pad>
        <div className="stack">
          <h2>{STEPS[step]}</h2>
          {step === 0 && <BasicFields d={d} set={set} errors={errors} />}
          {step === 1 && <SizeFields d={d} set={set} errors={errors} />}
          {step === 2 && <PricingFields d={d} set={set} errors={errors} />}
          {step === 3 && (
            <div className="grid-3" style={{ alignItems: 'start' }}>
              <div className="stack-sm">
                <div className="label">Photographs</div>
                <Dropzone accept={IMAGE_ACCEPT} onFiles={(f) => setImages((cur) => [...cur, ...f])} title="Cover and gallery" hint="The first photograph becomes the cover." />
                <FileList files={images} icon={<ImagePlus size={15} />} onRemove={(i) => setImages((cur) => cur.filter((_, k) => k !== i))} />
              </div>
              <div className="stack-sm">
                <div className="label">Floor plan</div>
                <Dropzone accept={PLAN_ACCEPT} onFiles={(f) => setPlans((cur) => [...cur, ...f])} title="Floor plan" hint="Image or PDF." />
                <FileList files={plans} icon={<FileText size={15} />} onRemove={(i) => setPlans((cur) => cur.filter((_, k) => k !== i))} />
              </div>
              <div className="stack-sm">
                <div className="label">Video</div>
                <Dropzone accept={VIDEO_ACCEPT} onFiles={(f) => setVideos((cur) => [...cur, ...f])} title="Walkthrough video" hint="MP4 or WebM, up to 500 MB." />
                <FileList files={videos} icon={<Film size={15} />} onRemove={(i) => setVideos((cur) => cur.filter((_, k) => k !== i))} />
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="stack">
              <FeaturePicker value={d.featureIds} onChange={(ids) => set('featureIds', ids)} />
              <DescriptionFields d={d} set={set} />
            </div>
          )}
          {step === 5 && (
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <div className="stack">
                <div className="field">
                  <span>On the website</span>
                  <Segmented value={d.published ? 'published' : 'draft'} onChange={(v) => set('published', v === 'published')} options={[{ value: 'draft', label: 'Draft — hidden' }, { value: 'published', label: 'Published' }]} />
                  <span className="hint">A draft is saved in the admin but not shown to visitors.</span>
                </div>
                <Toggle checked={d.featured} onChange={(v) => set('featured', v)} label={<span className="row" style={{ gap: 6 }}><Star size={15} /> Feature on the homepage</span>} />
              </div>
              <Card pad className="stack-sm">
                <h3>Summary</h3>
                <KV
                  items={[
                    ['Unit', d.code || '—'],
                    ['Floor', floor ? floorName(floor) : '—'],
                    ['Type', type?.name ?? '—'],
                    ['Bedrooms / baths', `${d.bedrooms ?? '—'} / ${d.bathrooms ?? '—'}`],
                    ['Size', area(d.areaSqm)],
                    ['Price', money(d.priceMinor, d.currency)],
                    ['Files', `${images.length} photographs, ${plans.length} plans, ${videos.length} videos`],
                    ['Features', `${d.featureIds.length}`],
                  ]}
                />
              </Card>
            </div>
          )}
          {serverError && <Alert tone="error">{serverError}</Alert>}
        </div>
      </Card>

      <div className="sticky-actions" style={{ top: 'auto', bottom: 16 }}>
        <Button icon={<ChevronLeft size={16} />} disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
        <span className="muted small">Step {step + 1} of {STEPS.length}</span>
        <span className="spacer" />
        <Button variant="ghost" onClick={() => navigate('/residences')}>Cancel</Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => check(step) && setStep(step + 1)}>
            Next <ChevronRight size={16} />
          </Button>
        ) : (
          <Button variant="primary" busy={busy} icon={<Rocket size={16} />} onClick={() => void finish()}>
            {d.published ? 'Create & publish' : 'Create draft'}
          </Button>
        )}
      </div>
    </>
  );
}
