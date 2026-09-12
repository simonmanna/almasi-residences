import {
  BarChart3,
  BookOpen,
  Building,
  Building2,
  CalendarCheck,
  Car,
  Clapperboard,
  DoorOpen,
  FileText,
  Frame,
  Handshake,
  HardHat,
  HelpCircle,
  History,
  Home,
  Image,
  Images,
  Inbox,
  Info,
  Layers,
  LayoutDashboard,
  PenTool,
  Phone,
  Settings,
  Shapes,
  ShieldCheck,
  Sofa,
  Sparkles,
  Tag,
  Users,
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

/** §2 — the sidebar, grouped the way the developer thinks about the property. */
export const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard, title: 'Admin Panel', sub: 'Manage your residences, floors, residents and more' }],
  },
  {
    title: 'Property',
    items: [
      { label: 'Property overview', to: '/property', icon: Building2, sub: 'The project, its address and who is building it' },
      { label: 'Floors', to: '/floors', icon: Layers, sub: 'Every level of the building and what is on it' },
      { label: 'Residences', to: '/residences', icon: DoorOpen, sub: 'Every home: status, price, specifications and media' },
      { label: 'Residence types', to: '/types', icon: Shapes, sub: 'The types buyers choose between, and the feature catalogue' },
      { label: 'Rooms / spaces', to: '/rooms', icon: Sofa, sub: 'The rooms inside each residence' },
      { label: 'Parking', to: '/parking', icon: Car, sub: 'Basement and visitor bays' },
      { label: 'Amenities', to: '/amenities', icon: Sparkles, sub: 'Pool, gym, restaurant and the rest of the building' },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Residents', to: '/residents', icon: Users, needs: 'resident.view', sub: 'Who lives where — private to the admin' },
      { label: 'Buyers / clients', to: '/buyers', icon: Handshake, needs: 'buyer.view', sub: 'From prospect to owner' },
      { label: 'Enquiries / leads', to: '/enquiries', icon: Inbox, needs: 'enquiry.view', sub: 'Every enquiry from the website' },
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
    title: 'Sales',
    items: [
      { label: 'Availability', to: '/availability', icon: Building, sub: 'The building at a glance, unit by unit' },
      { label: 'Pricing', to: '/pricing', icon: Tag, sub: 'Prices, discounts and price history' },
      { label: 'Reservations', to: '/reservations', icon: CalendarCheck, sub: 'Residences reserved or on hold, and who for' },
      { label: 'Payment plans', to: '/payment-plans', icon: Wallet, sub: 'Deposit, milestones and instalments' },
      { label: 'Sales overview', to: '/sales', icon: BarChart3, sub: 'Value sold, reserved and still to sell' },
    ],
  },
  {
    title: 'Website content',
    items: [
      { label: 'Homepage', to: '/content/home', icon: Home, needs: 'content.edit', sub: 'The opening image, headline and buttons' },
      { label: 'About', to: '/content/about', icon: Info, needs: 'content.edit', sub: 'The developer and the architecture' },
      { label: 'Amenities content', to: '/content/amenities', icon: FileText, needs: 'content.edit', sub: 'The amenities page heading' },
      { label: 'Buying guide', to: '/content/buying', icon: BookOpen, needs: 'content.edit', sub: 'How to reserve, buy and pay' },
      { label: 'FAQs', to: '/faqs', icon: HelpCircle, sub: 'Questions buyers ask' },
      { label: 'Gallery & progress', to: '/progress', icon: HardHat, sub: 'Construction updates and the gallery page' },
      { label: 'Contact information', to: '/content/contact', icon: Phone, needs: 'content.edit', sub: 'Enquiry copy — contact details live on Property overview' },
    ],
  },
  {
    title: 'Management',
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
