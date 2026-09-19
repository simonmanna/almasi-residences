import {
  Activity,
  BarChart3,
  Contact,
  KeyRound,
  ListTodo,
  Megaphone,
  SlidersHorizontal,
  Building,
  Building2,
  CalendarCheck,
  ClipboardList,
  Car,
  Clapperboard,
  DoorOpen,
  FileText,
  Film,
  Frame,
  Handshake,
  HardHat,
  HelpCircle,
  History,
  Home,
  Image,
  Images,
  Inbox,
  KanbanSquare,
  Layers,
  Map,
  MapPin,
  LayoutDashboard,
  PenTool,
  Search,
  Send,
  Settings,
  Shapes,
  ShieldCheck,
  Sofa,
  Sparkles,
  Tag,
  Users,
  UserRoundSearch,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@avida/types';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Hidden from roles without this permission; the API would refuse them anyway. */
  needs?: Permission;
  /** Page title and subtitle in the top bar. */
  title?: string;
  sub?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * §50 — the sidebar, grouped the way a manager thinks ("I need to manage my
 * property"), not the way the database is shaped.
 */
export const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard, title: 'Admin Panel', sub: 'Manage your residences, floors, residents and more' }],
  },
  {
    title: 'Property',
    items: [
      { label: 'Overview', to: '/property', icon: Building2, sub: 'The project, its address and who is building it' },
      { label: 'Floors', to: '/floors', icon: Layers, sub: 'Every level of the building and what is on it' },
      { label: 'Residences', to: '/residences', icon: DoorOpen, sub: 'Every home: status, price, specifications and media' },
      { label: 'Residence types', to: '/types', icon: Shapes, sub: 'The types buyers choose between, and the feature catalogue' },
      { label: 'Specification', to: '/specifications', icon: ClipboardList, needs: 'typology.view', sub: 'How the residences are built and finished' },
      { label: 'Rooms / spaces', to: '/rooms', icon: Sofa, sub: 'The rooms inside each residence, and the plan' },
      { label: 'Parking', to: '/parking', icon: Car, sub: 'Basement and visitor bays' },
      { label: 'Amenities', to: '/amenities', icon: Sparkles, sub: 'Pool, gym, restaurant and the rest of the building' },
    ],
  },
  {
    title: 'Media',
    items: [
      { label: 'Images', to: '/media', icon: Image, sub: 'Photographs and renders for the website' },
      { label: 'Galleries', to: '/galleries', icon: Images, sub: 'Curated sets the public gallery shows' },
      { label: 'Videos', to: '/videos', icon: Clapperboard, sub: 'Films and walkthroughs' },
      { label: 'Floor plans', to: '/floor-plans', icon: Frame, sub: 'Residence, floor and building plans' },
      { label: 'Designs', to: '/designs', icon: PenTool, sub: 'Renders, drawings, elevations and site plans' },
    ],
  },
  {
    title: 'CRM',
    items: [
      { label: 'CRM dashboard', to: '/crm', icon: UserRoundSearch, needs: 'enquiry.view', title: 'CRM', sub: 'Today’s work, pipeline health and recent activity' },
      { label: 'Leads', to: '/enquiries', icon: Inbox, needs: 'enquiry.view', sub: 'Search, qualify, assign and follow up every lead' },
      { label: 'Pipeline', to: '/pipeline', icon: KanbanSquare, needs: 'enquiry.view', sub: 'Drag opportunities through every sales stage' },
      { label: 'Tasks', to: '/crm/tasks', icon: ListTodo, needs: 'enquiry.view', sub: 'Follow-ups: overdue, today and upcoming' },
      { label: 'Activities', to: '/crm/activities', icon: Activity, needs: 'enquiry.view', sub: 'Every call, message, meeting and change' },
      { label: 'Viewings', to: '/viewings', icon: CalendarCheck, needs: 'enquiry.view', sub: 'Schedule appointments and record outcomes' },
      { label: 'Deals', to: '/crm/deals', icon: Handshake, needs: 'enquiry.view', sub: 'Negotiations, reservations, contracts and sales' },
      { label: 'Reservations', to: '/reservations', icon: KeyRound, sub: 'Holds, deposits, expiry and conversion to sale' },
      { label: 'Contacts', to: '/buyers', icon: Contact, needs: 'buyer.view', sub: 'Clients, buyers and owners' },
      { label: 'Campaigns', to: '/crm/campaigns', icon: Megaphone, needs: 'enquiry.view', sub: 'Marketing campaigns and what they sold' },
      { label: 'Team', to: '/crm/team', icon: Users, needs: 'enquiry.view-all', title: 'Sales team', sub: 'Workload, overdue work and pipeline by person' },
      { label: 'Reports', to: '/crm/reports', icon: BarChart3, needs: 'reports.view', title: 'CRM reports', sub: 'Sources, conversion, speed and lost reasons' },
      { label: 'CRM settings', to: '/crm/settings', icon: SlidersHorizontal, needs: 'enquiry.view', sub: 'Pipeline stages, scoring and assignment' },
    ],
  },
  {
    title: 'Sales & inventory',
    items: [
      { label: 'Residents', to: '/residents', icon: Users, needs: 'resident.view', sub: 'Who lives where — private to the admin' },
      { label: 'Availability', to: '/availability', icon: Building, sub: 'The building at a glance, unit by unit' },
      { label: 'Pricing', to: '/pricing', icon: Tag, sub: 'Prices, discounts and price history' },
      { label: 'Payment plans', to: '/payment-plans', icon: Wallet, sub: 'Deposit, milestones and instalments' },
    ],
  },
  {
    title: 'Website',
    items: [
      { label: 'Publishing', to: '/publishing', icon: Send, needs: 'content.view', sub: 'Drafts waiting to go live, and the archive' },
      { label: 'Page content', to: '/content/home', icon: FileText, needs: 'content.view', sub: 'Headlines and words, page by page' },
      { label: 'Placements', to: '/placements', icon: Home, needs: 'content.view', sub: 'Which image or film fills each place on the site' },
      { label: 'Tours', to: '/tours', icon: Map, needs: 'content.view', sub: 'The walkthroughs and the homepage story' },
      { label: 'Film', to: '/film', icon: Film, needs: 'content.view', sub: 'The architectural film and its chapters' },
      { label: 'SEO', to: '/seo', icon: Search, needs: 'content.view', sub: 'Titles, descriptions and share images' },
      { label: 'Location', to: '/location', icon: MapPin, needs: 'content.view', sub: 'Location text and the places around the site' },
      { label: 'FAQs', to: '/faqs', icon: HelpCircle, sub: 'Questions buyers ask' },
      { label: 'Construction progress', to: '/progress', icon: HardHat, sub: 'Dated updates from the site' },
    ],
  },
  {
    title: 'Reports',
    items: [{ label: 'Sales overview', to: '/sales', icon: BarChart3, sub: 'Value sold, reserved and still to sell' }],
  },
  {
    title: 'System',
    items: [
      { label: 'Users & roles', to: '/users', icon: ShieldCheck, needs: 'user.manage', sub: 'Who can do what' },
      { label: 'Activity / audit log', to: '/audit', icon: History, needs: 'audit.view', sub: 'Every change, who made it and when' },
      { label: 'Settings', to: '/settings', icon: Settings, sub: 'Your account and the platform' },
    ],
  },
];

export function navFor(path: string): NavItem | undefined {
  const all = NAV.flatMap((g) => g.items);
  return all.find((i) => i.to === path) ?? all.filter((i) => i.to !== '/' && path.startsWith(i.to)).sort((a, b) => b.to.length - a.to.length)[0];
}
