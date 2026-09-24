import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, ChevronDown, KeyRound, LogOut, Menu as MenuIcon, Search, Settings } from 'lucide-react';
import { get, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, initials } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link, navigate, useDebounced, useLocation } from '../lib/router';
import { Menu } from '../components/ui';
import { NAV, navFor } from './nav';

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 48 40" aria-hidden="true">
      <path d="M24 2 44 16 24 38 4 16Z" fill="#dcedfc" />
      <path d="M24 2 34 16 24 38 14 16Z" fill="#8fc5f4" />
      <path d="M4 16h40M14 16 24 2l10 14" fill="none" stroke="#1b5d98" strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 2 44 16 24 38 4 16Z" fill="none" stroke="#1b5d98" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/** §27 — one box for everything: "A2" lands on residence A2. */
function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const term = useDebounced(q.trim(), 180);
  const { data, loading } = useQuery(term ? `search:${term}` : null, () => get<{ results: SearchResult[] }>(`/admin/search${qs({ q: term })}`));
  const results = data?.results ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => setActive(0), [term]);

  const go = (r: SearchResult) => {
    setOpen(false);
    setQ('');
    input.current?.blur();
    navigate(r.href);
  };

  return (
    <div className="search" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <Search size={17} />
      <input
        ref={input}
        value={q}
        placeholder="Search leads, residences, deals…"
        aria-label="Search the admin"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && results[active]) go(results[active]!);
          if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
        }}
      />
      {!q && <kbd>Ctrl K</kbd>}
      {open && term && (
        <div className="search-results" role="listbox">
          {results.map((r, i) => (
            <a
              key={`${r.type}:${r.id}`}
              href={r.href}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                go(r);
              }}
            >
              <span className="type">{r.type}</span>
              <span>
                {r.title}
                <small>{r.subtitle}</small>
              </span>
            </a>
          ))}
          {!loading && results.length === 0 && <div className="search-empty">Nothing matches “{term}”.</div>}
          {loading && results.length === 0 && <div className="search-empty">Searching…</div>}
        </div>
      )}
    </div>
  );
}

interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** The bell: new and assigned leads, due and overdue follow-ups, viewing and deal changes. */
function Notifications() {
  const { can } = useAuth();
  const allowed = can('enquiry.view');
  const { data } = useQuery(allowed ? 'crm:inbox' : null, () => get<{ items: InboxItem[]; unread: number }>('/admin/crm/inbox'));
  useEffect(() => {
    if (!allowed) return;
    const t = setInterval(() => invalidate('crm:inbox'), 60_000);
    return () => clearInterval(t);
  }, [allowed]);
  if (!allowed) return <span className="icon-btn" aria-hidden="true"><Bell size={19} /></span>;
  const unread = data?.unread ?? 0;
  const markRead = async (ids?: string[]) => {
    await post('/admin/crm/inbox/read', ids ? { ids } : {}).catch(() => undefined);
    invalidate('crm:inbox');
  };
  return (
    <Menu
      trigger={(toggle) => (
        <button type="button" className="icon-btn" onClick={toggle} aria-label={unread ? `${unread} unread notifications` : 'Notifications'} title={unread ? `${unread} unread` : 'No new notifications'}>
          <Bell size={19} />
          {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}
    >
      {(close) => (
        <div className="inbox">
          <div className="inbox-head">
            <strong>Notifications</strong>
            {unread > 0 && <button type="button" className="link-button small" onClick={() => void markRead()}>Mark all read</button>}
          </div>
          {(data?.items ?? []).length === 0 && <div className="inbox-empty">You are all caught up.</div>}
          <div className="inbox-list">
            {(data?.items ?? []).map((n) => (
              <button
                key={n.id}
                type="button"
                className={`inbox-item ${n.readAt ? '' : 'unread'} kind-${n.kind.split('.')[0]}`}
                onClick={() => {
                  close();
                  if (!n.readAt) void markRead([n.id]);
                  if (n.link) navigate(n.link);
                }}
              >
                <span className={`inbox-dot ${n.kind.includes('overdue') || n.kind.includes('cancel') || n.kind.includes('lost') ? 'red' : n.kind.includes('due') ? 'amber' : ''}`} />
                <span className="inbox-text">
                  <strong>{n.title}</strong>
                  {n.body && <small>{n.body}</small>}
                  <small className="faint">{ago(n.createdAt)}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Menu>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, can, signOut } = useAuth();
  const { path } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('admin:nav') ?? '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const current = navFor(path);

  useEffect(() => setMenuOpen(false), [path]);
  // Navigating into a collapsed group opens it once; after that the user's toggle wins.
  useEffect(() => {
    const group = NAV.find((g) => g.items.some((i) => i === current));
    if (group && collapsed[group.title]) setCollapsed((c) => ({ ...c, [group.title]: false }));
  }, [path]);
  useEffect(() => {
    try {
      localStorage.setItem('admin:nav', JSON.stringify(collapsed));
    } catch {
      /* storage may be unavailable; the menu still works */
    }
  }, [collapsed]);

  return (
    <div className="app">
      <aside className="sidebar" data-open={menuOpen}>
        <Link to="/" className="brand" aria-label="Almasi Residence — dashboard">
          <BrandMark />
          <span className="brand-text">
            <span className="brand-name">ALMASI</span>
            <span className="brand-sub">RESIDENCES</span>
          </span>
        </Link>
        <nav aria-label="Admin">
          {NAV.map((group) => {
            const items = group.items.filter((i) => !i.needs || can(i.needs, i.min));
            if (!items.length) return null;
            const closed = !!collapsed[group.title];
            return (
              <div key={group.title} className="nav-group">
                {group.title !== 'Overview' && (
                  <button type="button" className="nav-title" aria-expanded={!closed} onClick={() => setCollapsed((c) => ({ ...c, [group.title]: !closed }))}>
                    {group.title}
                    <ChevronDown size={13} />
                  </button>
                )}
                {!closed &&
                  items.map((item) => (
                    <Link key={item.to} to={item.to} className="nav-item" aria-current={item === current ? 'page' : undefined} title={item.label}>
                      <item.icon size={18} />
                      <span>{item.label}</span>
                    </Link>
                  ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-toggle" aria-label="Open menu" onClick={() => setMenuOpen((o) => !o)}>
            <MenuIcon size={20} />
          </button>
          <div className="topbar-title">
            <h1>{current?.title ?? current?.label ?? 'Admin Panel'}</h1>
            <p>{current?.sub ?? 'Almasi Residence'}</p>
          </div>
          <GlobalSearch />
          <Notifications />
          <Menu
            trigger={(toggle) => (
              <button type="button" className="user-chip" onClick={toggle} aria-haspopup="menu">
                <span className="avatar">{initials(user!.name)}</span>
                <div>
                  <strong>{user!.name}</strong>
                  <span>{user!.roleName ?? user!.role}</span>
                </div>
                <ChevronDown size={16} className="muted" />
              </button>
            )}
          >
            {(close) => (
              <>
                <div style={{ padding: '8px 10px 10px' }}>
                  <strong style={{ display: 'block' }}>{user!.name}</strong>
                  <span className="muted small">{user!.email}</span>
                </div>
                <hr />
                <Link to="/settings" onClick={close}>
                  <Settings size={16} /> Settings
                </Link>
                <Link to="/settings#password" onClick={close}>
                  <KeyRound size={16} /> Change password
                </Link>
                <hr />
                <button type="button" onClick={() => void signOut()}>
                  <LogOut size={16} /> Sign out
                </button>
              </>
            )}
          </Menu>
        </header>
        <main className="content" id="main">
          {children}
        </main>
      </div>
      {menuOpen && <div className="overlay" style={{ zIndex: 65, background: 'rgba(12,30,52,.3)' }} onClick={() => setMenuOpen(false)} />}
    </div>
  );
}
