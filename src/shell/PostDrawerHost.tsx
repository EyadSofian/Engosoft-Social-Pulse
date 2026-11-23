import { AnimatePresence } from 'motion/react';
import { useQueryState } from '../app/router/router';
import { ContentDrawer } from '../pages/content/ContentBoardPage';

/** Tells open pages that a post changed, so lists and calendars reload what they show. */
export const announceContentChanged = () => window.dispatchEvent(new Event('mobde3:content-changed'));

/**
 * Opens a post over the page you are on: any page can set `?post=<id>`. Closing removes it and leaves you on the
 * same page, so the Calendar, Overview or Publishing never send you to another page to look at one post.
 */
export function PostDrawerHost() {
  const [query, setQuery] = useQueryState();
  const id = query.get('post');
  return (
    <AnimatePresence>
      {id && <ContentDrawer key={id} id={id} onClose={() => setQuery({ post: null, publish: null })} onChanged={announceContentChanged} />}
    </AnimatePresence>
  );
}
