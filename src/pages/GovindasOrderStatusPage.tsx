import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicGovindasOrderStatus, GovindasOrder } from '../helpers/govindas';
import './Govindas.css';

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
type PublicOrder = Pick<GovindasOrder, 'id' | 'menuTitle' | 'customerName' | 'items' | 'totalCents' | 'status' | 'createdAtMillis'>;

const GovindasOrderStatusPage: React.FC = () => {
  const [params] = useSearchParams();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getPublicGovindasOrderStatus(params.get('order') || '', params.get('receipt') || '')
      .then((result) => setOrder(result.order))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Order status could not be loaded.'));
  }, [params]);
  if (error) return <main className="govindas-public"><section className="govindas-order-card"><h1>Govinda’s order status</h1><div className="error-message">{error}</div></section></main>;
  if (!order) return <main className="govindas-public"><section className="govindas-order-card">Loading your order…</section></main>;
  return <main className="govindas-public"><section className="govindas-order-card"><p className="eyebrow">ISKCON PARSIPPANY GOVINDA’S</p><h1>Order status</h1><p>Hello, <strong>{order.customerName}</strong></p><p><span className="govindas-status-badge">{order.status}</span></p><h2>{order.menuTitle}</h2><div className="govindas-status-items">{order.items.map((item) => <div key={item.itemId}><span>{item.quantity} × {item.name}</span><strong>{money(item.lineTotalCents)}</strong></div>)}</div><div className="govindas-order-total"><span>Total</span><strong>{money(order.totalCents)}</strong></div><p className="small muted">Confirmation number: {order.id}</p><button className="secondary-btn govindas-status-link" onClick={() => window.location.reload()}>Refresh status</button></section></main>;
};

export default GovindasOrderStatusPage;
