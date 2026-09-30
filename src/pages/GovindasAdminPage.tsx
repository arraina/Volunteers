import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../config/firebase';
import { useAuth } from '../helpers/useAuth';
import { getDepartmentWorkspace } from '../helpers/departments';
import { createGovindasShareLink, getGovindasAdminData, GovindasMenu, GovindasMenuItem, GovindasOrder, saveGovindasMenu, updateGovindasOrderStatus } from '../helpers/govindas';
import './AdminDashboard.css';
import './Govindas.css';

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const localValue = (millis?: number) => millis ? new Date(millis - new Date(millis).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const blankItem = (): GovindasMenuItem => ({ id: crypto.randomUUID(), name: '', description: '', priceCents: 0, available: true });

const GovindasAdminPage: React.FC = () => {
  const navigate = useNavigate(); const { isAdmin, isOwner } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null); const [menus, setMenus] = useState<GovindasMenu[]>([]); const [orders, setOrders] = useState<GovindasOrder[]>([]);
  const [menuId, setMenuId] = useState(''); const [title, setTitle] = useState(''); const [cutoff, setCutoff] = useState(''); const [pickup, setPickup] = useState('');
  const [pickupDetails, setPickupDetails] = useState(''); const [zelleInstructions, setZelleInstructions] = useState(''); const [items, setItems] = useState<GovindasMenuItem[]>([blankItem()]);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const data = await getGovindasAdminData(); setMenus(data.menus); setOrders(data.orders); }, []);
  useEffect(() => { getDepartmentWorkspace('govindas').then((workspace) => { const ok = workspace.canManage || isOwner; setAllowed(ok); if (ok) load().catch(() => setError('Could not load Govinda’s data.')); }).catch(() => setAllowed(false)); }, [isOwner, load]);
  const uploadImage = async (itemId: string, file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size >= 5 * 1024 * 1024) { setError('Choose a JPG, PNG, WebP, or GIF image smaller than 5 MB.'); return; }
    setBusy(true); setError('');
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100);
      const imagePath = `govindas/menu-items/${crypto.randomUUID()}-${safeName}`;
      const imageRef = ref(storage, imagePath);
      await uploadBytes(imageRef, file, { contentType: file.type });
      const imageUrl = await getDownloadURL(imageRef);
      setItems((current) => current.map((item) => item.id === itemId ? { ...item, imageUrl, imagePath } : item));
      setMessage('Image uploaded. Save the weekly menu to publish it.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Image could not be uploaded.'); } finally { setBusy(false); }
  };
  const removeImage = async (itemId: string) => {
    const item = items.find((value) => value.id === itemId);
    setItems((current) => current.map((value) => value.id === itemId ? { ...value, imageUrl: '', imagePath: '' } : value));
    if (item?.imagePath) { try { await deleteObject(ref(storage, item.imagePath)); } catch { /* Saving still removes the image from the menu. */ } }
  };
  const editMenu = (menu?: GovindasMenu) => { setMenuId(menu?.id || ''); setTitle(menu?.title || ''); setCutoff(localValue(menu?.cutoffMillis)); setPickup(localValue(menu?.pickupMillis)); setPickupDetails(menu?.pickupDetails || ''); setZelleInstructions(menu?.zelleInstructions || ''); setItems(menu?.items?.length ? menu.items : [blankItem()]); setError(''); setMessage(''); };
  const save = async () => { setBusy(true); setError(''); try { const savedId = await saveGovindasMenu({ menuId: menuId || undefined, title, cutoffMillis: new Date(cutoff).getTime(), pickupMillis: new Date(pickup).getTime(), pickupDetails, zelleInstructions, items }); setMenuId(savedId); setMessage('Weekly menu saved.'); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Menu could not be saved.'); } finally { setBusy(false); } };
  const share = async (id: string) => { try { const result = await createGovindasShareLink(id); const url = `${window.location.origin}${window.location.pathname.startsWith('/Volunteers') ? '/Volunteers' : ''}/govindas/order?token=${encodeURIComponent(result.token)}`; await navigator.clipboard.writeText(url); setMessage(`Public ordering link copied. It expires ${new Date(result.expiresAtMillis).toLocaleString()}.`); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create link.'); } };
  if (allowed === null) return <div className="loading">Checking Govinda’s access…</div>;
  if (!allowed) return <main className="auth-page"><section className="panel auth-card"><h1>Govinda’s access required</h1><p>Only the Owner or an assigned Govinda’s Department Admin can manage menus and orders.</p><button className="primary-btn" onClick={() => navigate(isAdmin ? '/admin?tab=departments' : '/dashboard?tab=departments')}>Back to departments</button></section></main>;
  return <div className="admin-dashboard"><header className="dashboard-header"><div><h1>Govinda’s</h1><p>Weekly menus and private order management</p></div><div className="header-actions"><button className="logout-btn" onClick={() => navigate(isAdmin ? '/admin?tab=departments' : '/dashboard?tab=departments')}>Departments</button><button className="logout-btn" onClick={async () => { await signOut(auth); navigate('/login'); }}>Logout</button></div></header><main className="dashboard-content govindas-admin">
    {error && <div className="error-message">{error}</div>}{message && <div className="success-message">{message}</div>}
    <section className="panel"><div className="panel-head"><div><h2>Weekly menu</h2><p className="muted small">Customers see only available items. Totals are calculated securely on the server.</p></div><button className="secondary-btn" onClick={() => editMenu()}>New menu</button></div><div className="govindas-menu-form"><label><span>Menu title</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday Govinda’s menu" /></label><label><span>Order cutoff</span><input type="datetime-local" value={cutoff} onChange={(e) => setCutoff(e.target.value)} /></label><label><span>Pickup date and time</span><input type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} /></label><label><span>Pickup details</span><textarea value={pickupDetails} onChange={(e) => setPickupDetails(e.target.value)} /></label><label><span>Zelle instructions</span><textarea value={zelleInstructions} onChange={(e) => setZelleInstructions(e.target.value)} placeholder="Where to send payment and what to include in the memo" /></label></div>
    <div className="govindas-items"><h3>Menu items</h3>{items.map((item, index) => <div className="govindas-item-edit" key={item.id}><input aria-label={`Item name ${index + 1}`} value={item.name} onChange={(e) => setItems((current) => current.map((value) => value.id === item.id ? { ...value, name: e.target.value } : value))} placeholder="Item name" /><input aria-label={`Description ${index + 1}`} value={item.description} onChange={(e) => setItems((current) => current.map((value) => value.id === item.id ? { ...value, description: e.target.value } : value))} placeholder="Description" /><div className="govindas-image-edit">{item.imageUrl && <img src={item.imageUrl} alt="" />}<label className="secondary-btn"><span>{item.imageUrl ? 'Replace image' : 'Add image'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => uploadImage(item.id, e.target.files?.[0])} /></label>{item.imageUrl && <button className="link-btn danger" onClick={() => removeImage(item.id)}>Remove image</button>}</div><input aria-label={`Price ${index + 1}`} type="number" min="0" step="0.01" value={item.priceCents ? item.priceCents / 100 : ''} onChange={(e) => setItems((current) => current.map((value) => value.id === item.id ? { ...value, priceCents: Math.round((Number(e.target.value) || 0) * 100) } : value))} placeholder="Price" /><label className="checkbox-label"><input type="checkbox" checked={item.available} onChange={(e) => setItems((current) => current.map((value) => value.id === item.id ? { ...value, available: e.target.checked } : value))} />Available</label><button className="link-btn danger" onClick={() => setItems((current) => current.length === 1 ? [blankItem()] : current.filter((value) => value.id !== item.id))}>Remove item</button></div>)}<button className="secondary-btn" onClick={() => setItems((current) => [...current, blankItem()])}>+ Add menu item</button></div><button className="primary-btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save weekly menu'}</button></section>
    <section className="panel"><h2>Saved menus</h2><div className="govindas-saved-list">{menus.map((menu) => <div key={menu.id}><span><strong>{menu.title}</strong><small>Pickup {new Date(menu.pickupMillis).toLocaleString()}</small></span><div className="row"><button className="secondary-btn" onClick={() => editMenu(menu)}>Edit</button><button className="primary-btn" onClick={() => share(menu.id)}>Copy public link</button></div></div>)}</div></section>
    <section className="panel"><h2>Private orders</h2>{orders.length === 0 ? <p className="muted">No orders yet.</p> : <div className="table-scroll"><table className="report-table"><thead><tr><th>Customer</th><th>Menu</th><th>Items</th><th>Total</th><th>Zelle reference</th><th>Status</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.customerName}</strong><br /><span className="small">{order.phoneNumber}</span></td><td>{order.menuTitle}</td><td>{order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</td><td>{money(order.totalCents)}</td><td>{order.zelleReference}</td><td><select value={order.status} onChange={async (e) => { await updateGovindasOrderStatus(order.id, e.target.value); await load(); }}><option value="received">Received</option><option value="confirmed">Confirmed</option><option value="ready">Ready</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></td></tr>)}</tbody></table></div>}</section>
  </main></div>;
};
export default GovindasAdminPage;
