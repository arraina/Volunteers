import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export interface GovindasMenuItem { id: string; name: string; description: string; imageUrl?: string; imagePath?: string; priceCents: number; available: boolean; }
export interface GovindasMenu { id: string; title: string; pickupDetails: string; zelleInstructions: string; cutoffMillis: number; pickupMillis: number; items: GovindasMenuItem[]; }
export interface GovindasOrderItem { itemId: string; name: string; quantity: number; unitPriceCents: number; lineTotalCents: number; }
export interface GovindasOrder { id: string; menuId: string; menuTitle: string; customerName: string; phoneNumber: string; zelleReference: string; items: GovindasOrderItem[]; totalCents: number; status: string; createdAtMillis: number | null; }

export async function getGovindasAdminData(): Promise<{ menus: GovindasMenu[]; orders: GovindasOrder[] }> {
  return (await httpsCallable<Record<string, never>, { menus: GovindasMenu[]; orders: GovindasOrder[] }>(functions, 'getGovindasAdminData')({})).data;
}
export async function saveGovindasMenu(menu: Omit<GovindasMenu, 'id'> & { menuId?: string }): Promise<string> {
  return (await httpsCallable<typeof menu, { menuId: string }>(functions, 'saveGovindasMenu')(menu)).data.menuId;
}
export async function createGovindasShareLink(menuId: string): Promise<{ token: string; expiresAtMillis: number }> {
  return (await httpsCallable<{ menuId: string }, { token: string; expiresAtMillis: number }>(functions, 'createGovindasShareLink')({ menuId })).data;
}
export async function getPublicGovindasMenu(token: string): Promise<{ menu: GovindasMenu; expiresAtMillis: number }> {
  return (await httpsCallable<{ token: string }, { menu: GovindasMenu; expiresAtMillis: number }>(functions, 'getPublicGovindasMenu')({ token })).data;
}
export async function placeGovindasOrder(input: { token: string; customerName: string; phoneNumber: string; zelleReference: string; items: { itemId: string; quantity: number }[] }): Promise<{ orderId: string; confirmationToken: string; totalCents: number; status: string }> {
  return (await httpsCallable<typeof input, { orderId: string; confirmationToken: string; totalCents: number; status: string }>(functions, 'placeGovindasOrder')(input)).data;
}
export async function getPublicGovindasOrderStatus(orderId: string, confirmationToken: string): Promise<{ order: Pick<GovindasOrder, 'id' | 'menuTitle' | 'customerName' | 'items' | 'totalCents' | 'status' | 'createdAtMillis'> }> {
  return (await httpsCallable<{ orderId: string; confirmationToken: string }, { order: Pick<GovindasOrder, 'id' | 'menuTitle' | 'customerName' | 'items' | 'totalCents' | 'status' | 'createdAtMillis'> }>(functions, 'getPublicGovindasOrderStatus')({ orderId, confirmationToken })).data;
}
export async function updateGovindasOrderStatus(orderId: string, status: string): Promise<void> {
  await httpsCallable<{ orderId: string; status: string }, { updated: boolean }>(functions, 'updateGovindasOrderStatus')({ orderId, status });
}
