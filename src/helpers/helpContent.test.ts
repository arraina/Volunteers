import { HELP_ARTICLES, findHelpArticles } from './helpContent';

describe('Help Center search', () => {
  test('finds the relevant task recovery guide', () => {
    expect(findHelpArticles('How do I restore a deleted task?')[0].id).toBe('trash');
  });

  test('finds volunteer signup guidance', () => {
    expect(findHelpArticles('new volunteer signup password').some((item) => item.id === 'volunteer-quick-start')).toBe(true);
  });

  test('returns the full manual for an empty search', () => {
    expect(findHelpArticles('')).toHaveLength(HELP_ARTICLES.length);
  });
});
