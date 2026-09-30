import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicGovindasMenu, GovindasMenu, placeGovindasOrder } from '../helpers/govindas';
import { normalizePhoneNumber } from '../helpers/phone';
import './Govindas.css';

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const GovindasOrderPage: React.FC = () => {
  const [params] = useSearchParams(); const token = params.get('token') || '';
  const [menu, setMenu] = useState<GovindasMenu | null>(null); const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState(''); const [phoneNumber, setPhoneNumber] = useState(''); const [zelleReference, setZelleReference] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ orderId: string; confirmationToken: string; totalCents: number } | null>(null);
  useEffect(() => { getPublicGovindasMenu(token).then((result) => setMenu(result.menu)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Menu could not be loaded.')).finally(() => setLoading(false)); }, [token]);
  const total = useMemo(() => menu?.items.reduce((sum, item) => sum + item.priceCents * (quantities[item.id] || 0), 0) || 0, [menu, quantities]);
  const submit = async () => { setSubmitting(true); setError(''); try { const result = await placeGovindasOrder({ token, customerName, phoneNumber: normalizePhoneNumber(phoneNumber, true), zelleReference, items: Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([itemId, quantity]) => ({ itemId, quantity })) }); setConfirmation({ orderId: result.orderId, confirmationToken: result.confirmationToken, totalCents: result.totalCents }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Order could not be submitted.'); } finally { setSubmitting(false); } };
  if (loading) return <main className="govindas-public"><section className="govindas-order-card">Loading Govinda’s menu…</section></main>;
  if (error && !menu) return <main className="govindas-public"><section className="govindas-order-card"><h1>Govinda’s</h1><div className="error-message">{error}</div></section></main>;
  if (confirmation) {
    const statusUrl = `${window.location.origin}${window.location.pathname.startsWith('/Volunteers') ? '/Volunteers' : ''}/govindas/order-status?order=${encodeURIComponent(confirmation.orderId)}&receipt=${encodeURIComponent(confirmation.confirmationToken)}`;
    return <main className="govindas-public"><section className="govindas-order-card govindas-confirmation"><p className="eyebrow">ORDER RECEIVED</p><h1>Thank you, {customerName}</h1><p>Your order total is <strong>{money(confirmation.totalCents)}</strong>.</p><div><span>Confirmation number</span><strong>{confirmation.orderId}</strong></div><p>Save your private status link to see when the order is confirmed or ready for pickup. Anyone with this link can see the order summary.</p><a className="primary-btn govindas-status-link" href={statusUrl}>View order status</a><button className="secondary-btn govindas-status-link" onClick={() => navigator.clipboard.writeText(statusUrl)}>Copy private status link</button></section></main>;
  }
  return <main className="govindas-public"><section className="govindas-order-card"><p className="eyebrow">ISKCON PARSIPPANY GOVINDA’S</p><h1>{menu?.title}</h1><p className="muted">Order by {menu && new Date(menu.cutoffMillis).toLocaleString()} · Pickup {menu && new Date(menu.pickupMillis).toLocaleString()}</p>{menu?.pickupDetails && <div className="govindas-info"><strong>Pickup</strong><p>{menu.pickupDetails}</p></div>}
    <div className="govindas-public-items">{menu?.items.map((item) => <div key={item.id}><span><strong>{item.name}</strong>{item.description && <small>{item.description}</small>}<b>{money(item.priceCents)}</b></span><label><span>Quantity</span><input type="number" min="0" max="50" value={quantities[item.id] || ''} onChange={(e) => setQuantities((current) => ({ ...current, [item.id]: Math.max(0, Math.min(50, Math.floor(Number(e.target.value) || 0))) }))} /></label></div>)}</div>
    <div className="govindas-order-total"><span>Order total</span><strong>{money(total)}</strong></div>{menu?.zelleInstructions && <div className="govindas-info"><strong>Zelle payment instructions</strong><p>{menu.zelleInstructions}</p><small>Never enter a password, PIN, or bank-login information here.</small></div>}
    <div className="govindas-customer-form"><label><span>Your name *</span><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></label><label><span>Phone number with country code *</span><input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+19735551234" /></label><label><span>Zelle sender name or payment reference *</span><input value={zelleReference} onChange={(e) => setZelleReference(e.target.value)} /><small>Do not enter banking credentials.</small></label></div>{error && <div className="error-message">{error}</div>}<button className="primary-btn govindas-submit" disabled={submitting || total <= 0} onClick={submit}>{submitting ? 'Submitting…' : `Place order · ${money(total)}`}</button>
  </section></main>;
};
export default GovindasOrderPage;
