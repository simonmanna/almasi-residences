'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { contactFrom, type Contact } from '../../lib/contact';

const ContactContext = createContext<Contact>(contactFrom(null));

/** The sales contact channels, read once by the layout from the API and shared with every client island. */
export function ContactProvider({ contact, children }: { contact: Contact; children: ReactNode }) {
  return <ContactContext.Provider value={contact}>{children}</ContactContext.Provider>;
}

export const useContact = () => useContext(ContactContext);
