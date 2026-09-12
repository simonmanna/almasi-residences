import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, ChevronDown, KeyRound, LogOut, Menu as MenuIcon, Search, Settings } from 'lucide-react';
import { ROLE_LABEL, type AdminRole } from '@avida/types';
import { get, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';
import { useQuery } from '../lib/query';
import { Link, navigate, useDebounced, useLocation } from '../lib/router';
import type { Dashboard, Paged } from '../lib/types';
import { Menu, MediaImg } from '../components/ui';
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
        placeholder="Search residences, residents, floors…"
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

function Notifications() {
  const { can } = useAuth();
  const { data } = useQuery(can('enquiry.view') ? 'enquiries:new-count' : null, () => get<Paged<unknown>>('/admin/enquiries?status=NEW&pageSize=1'));
  const count = data?.meta.total ?? 0;
  return (
    <Link to={can('enquiry.view') ? '/enquiries?status=NEW' : '/'} className="icon-btn" aria-label={count ? `${count} new enquiries` : 'Notifications'} title={count ? `${count} new enquiries` : 'No new enquiries'}>
      <Bell size={19} />
      {count > 0 && <span className="dot" />}
    </Link>
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
  const { data: dash } = useQuery('dashboard', () => get<Dashboard>('/admin/dashboard'));
  const current = navFor(path);

  useEffect(() => setMenuOpen(false), [path]);
  useEffect(() => {
    try {
      localStorage.setItem('admin:nav', JSON.stringify(collapsed));
    } catch {
      /* storage may be unavailable; the menu still works */
    }
  }, [collapsed]);

  const newEnquiries = dash?.stats.enquiries.new ?? 0;

  return (
    <div className="app">
      <aside className="sidebar" data-open={menuOpen}>
        <Link to="/" className="brand" aria-label="Almasi Residences — dashboard">
          <BrandMark />
          <span className="brand-text">
            <span className="brand-name">ALMASI</span>
            <span className="brand-sub">RESIDENCES</span>
          </span>
        </Link>
        <nav aria-label="Admin">
          {NAV.map((group) => {
            const items = group.items.filter((i) => !i.needs || can(i.needs));
            if (!items.length) return null;
            const closed = collapsed[group.title] && !items.some((i) => i === current);
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
                      {item.to === '/enquiries' && newEnquiries > 0 && <b className="nav-count">{newEnquiries}</b>}
                    </Link>
                  ))}
              </div>
            );
          })}
        </nav>
        {dash && (
          <div className="sidebar-card">
            {dash.property.heroImage && <MediaImg m={dash.property.heroImage} thumb sizes="240px" />}
            <div className="sidebar-card-body">
              <strong>{dash.property.name}</strong>
              <span>{dash.property.location}</span>
            </div>
          </div>
        )}
      </aside>

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-toggle" aria-label="Open menu" onClick={() => setMenuOpen((o) => !o)}>
            <MenuIcon size={20} />
          </button>
          <div className="topbar-title">
            <h1>{current?.title ?? current?.label ?? 'Admin Panel'}</h1>
            <p>{current?.sub ?? 'Almasi Residences'}</p>
          </div>
          <GlobalSearch />
          <Notifications />
          <Menu
            trigger={(toggle) => (
              <button type="button" className="user-chip" onClick={toggle} aria-haspopup="menu">
                <span className="avatar">{initials(user!.name)}</span>
                <div>
                  <strong>{user!.name}</strong>
                  <span>{ROLE_LABEL[user!.role as AdminRole] ?? user!.role}</span>
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
