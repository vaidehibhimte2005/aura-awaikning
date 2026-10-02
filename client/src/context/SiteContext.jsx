import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api.js';

/** Public CMS settings (homepage copy, contact info, socials) + active announcements. */
const SiteContext = createContext({ settings: {}, announcements: [], loaded: false });

export function SiteProvider({ children }) {
  const [state, setState] = useState({ settings: {}, announcements: [], loaded: false });

  useEffect(() => {
    Promise.allSettled([api.get('/settings/public'), api.get('/announcements/active')]).then(([s, a]) => {
      setState({
        settings: s.status === 'fulfilled' ? s.value.data : {},
        announcements: a.status === 'fulfilled' ? a.value.data : [],
        loaded: true,
      });
    });
  }, []);

  return <SiteContext.Provider value={state}>{children}</SiteContext.Provider>;
}

export const useSite = () => useContext(SiteContext);
