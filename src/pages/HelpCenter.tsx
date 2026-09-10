import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { askHelpQuestion, isAiConfigured } from '../helpers/ai';
import { HELP_ARTICLES, HelpArticle, findHelpArticles } from '../helpers/helpContent';
import { useAuth } from '../helpers/useAuth';
import './HelpCenter.css';

const HelpCenter: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isOwner } = useAuth();
  const role = isOwner ? 'owner' : isAdmin ? 'admin' : 'volunteer';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerSources, setAnswerSources] = useState<HelpArticle[]>([]);
  const [asking, setAsking] = useState(false);
  const [assistantError, setAssistantError] = useState('');
  const suggestedQuestions = role === 'volunteer'
    ? ['How do I get started?', 'How do I join a task?', 'Why did my reminder not arrive?']
    : role === 'owner'
      ? ['How do I add an Admin?', 'How do I restore a task?', 'What should I check before an event?']
      : ['How do I add and assign a volunteer?', 'How do recurring tasks work?', 'What should I check before an event?'];

  const roleArticles = useMemo(() => HELP_ARTICLES.filter((article) => {
    if (role === 'owner') return true;
    if (role === 'admin') return article.roles.some((item) => ['everyone', 'volunteer', 'admin'].includes(item));
    return article.roles.some((item) => item === 'everyone' || item === 'volunteer');
  }), [role]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(roleArticles.map((article) => article.category)))], [roleArticles]);
  const visibleArticles = useMemo(() => findHelpArticles(query, roleArticles)
    .filter((article) => category === 'All' || article.category === category), [query, category, roleArticles]);

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = question.trim();
    if (!clean) return;
    const sources = findHelpArticles(clean, roleArticles).slice(0, 3);
    setAnswerSources(sources);
    setAssistantError('');
    setAsking(true);
    try {
      if (isAiConfigured) {
        const manual = roleArticles.map((article) => `## ${article.title}\n${article.sections.map((section) => `${section.heading}: ${section.text}`).join('\n')}`).join('\n\n');
        setAnswer(await askHelpQuestion(clean, manual, role));
      } else if (sources.length) {
        setAnswer(sources.map((article) => `${article.title}: ${article.summary} ${article.sections[0]?.text || ''}`).join('\n\n'));
      } else {
        setAnswer('I could not find this topic in the application manual. Please contact the Owner for assistance.');
      }
    } catch (err) {
      if (sources.length) {
        setAnswer(sources.map((article) => `${article.title}: ${article.summary} ${article.sections[0]?.text || ''}`).join('\n\n'));
        setAssistantError('The AI service is unavailable, so these answers were selected directly from the manual.');
      } else {
        setAnswer('I could not find this topic in the application manual. Please contact the Owner for assistance.');
        setAssistantError(err instanceof Error ? err.message : 'The help assistant is unavailable.');
      }
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="help-page">
      <header className="help-header">
        <div><p className="help-eyebrow">ISKCON Towaco Volunteer Management System</p><h1>Help Center</h1><p>Guidance for your {role} access</p></div>
        <button onClick={() => navigate(isAdmin ? '/admin' : '/dashboard')} className="help-back">Back to dashboard</button>
      </header>
      <main className="help-content">
        <section className="help-hero">
          <h2>How can we help?</h2>
          <p>Ask a question in ordinary language. Answers are limited to this application manual.</p>
          <form onSubmit={ask} className="help-question-form">
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="For example: How do I restore a deleted recurring task?" rows={3} />
            <button className="primary-btn" disabled={asking || !question.trim()}>{asking ? 'Finding answer…' : 'Ask Help Assistant'}</button>
          </form>
          <div className="help-suggestions"><span>Popular questions:</span>{suggestedQuestions.map((item) => <button type="button" key={item} onClick={() => setQuestion(item)}>{item}</button>)}</div>
          {answer && <div className="help-answer" aria-live="polite"><h3>Answer</h3>{answer.split('\n').map((line, index) => line ? <p key={index}>{line}</p> : null)}
            {assistantError && <p className="help-assistant-note">{assistantError}</p>}
            {answerSources.length > 0 && <div className="help-source-links"><span>Related guides:</span>{answerSources.map((article) => <a key={article.id} href={`#help-${article.id}`}>{article.title}</a>)}</div>}
          </div>}
        </section>

        <section className="help-library">
          <div className="help-library-head"><div><h2>Application Manual</h2><p>{visibleArticles.length} guide(s) available for your role</p></div>
            <div className="help-search-controls"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflows, reminders, tasks…" aria-label="Search help" />
              <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter help by category">{categories.map((item) => <option key={item}>{item}</option>)}</select>
            </div>
          </div>
          {visibleArticles.length === 0 && <div className="help-empty"><strong>No guide matched your search.</strong><span>Try fewer words or choose All categories.</span></div>}
          <div className="help-article-list">{visibleArticles.map((article) => <article id={`help-${article.id}`} className="help-article" key={article.id}>
            <div className="help-article-title"><span>{article.category}</span><h3>{article.title}</h3><p>{article.summary}</p></div>
            <div className="help-sections">{article.sections.map((section) => <section key={section.heading}><h4>{section.heading}</h4><p>{section.text}</p></section>)}</div>
          </article>)}</div>
        </section>
      </main>
    </div>
  );
};

export default HelpCenter;
