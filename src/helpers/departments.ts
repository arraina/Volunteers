import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export type DepartmentRole = 'admin' | 'member';
export interface Department { id: string; name: string; description: string; sortOrder: number; }
export interface DepartmentMembership { id: string; departmentId: string; userId: string; role: DepartmentRole; name: string; }
export interface DepartmentDirectoryResult { isOwner: boolean; managedDepartmentIds: string[]; accessibleDepartmentIds: string[]; departments: Department[]; memberships: DepartmentMembership[]; }
export type DepartmentItemType = 'task' | 'event' | 'announcement';
export interface DepartmentItem { id: string; departmentId: string; title: string; details: string; status: string; dateMillis: number | null; createdAtMillis: number | null; canEdit: boolean; }
export interface DepartmentWorkspaceResult { canManage: boolean; department: Pick<Department, 'id' | 'name' | 'description'>; tasks: DepartmentItem[]; events: DepartmentItem[]; announcements: DepartmentItem[]; }

export async function initializeDepartments(): Promise<void> {
  await httpsCallable<Record<string, never>, { created: number }>(functions, 'initializeDepartments')({});
}
export async function getDepartmentDirectory(): Promise<DepartmentDirectoryResult> {
  return (await httpsCallable<Record<string, never>, DepartmentDirectoryResult>(functions, 'getDepartmentDirectory')({})).data;
}
export async function setDepartmentMembership(departmentId: string, userId: string, role: DepartmentRole, active: boolean): Promise<void> {
  await httpsCallable<{ departmentId: string; userId: string; role: DepartmentRole; active: boolean }, { updated: boolean }>(functions, 'setDepartmentMembership')({ departmentId, userId, role, active });
}
export async function getDepartmentWorkspace(departmentId: string): Promise<DepartmentWorkspaceResult> {
  return (await httpsCallable<{ departmentId: string }, DepartmentWorkspaceResult>(functions, 'getDepartmentWorkspace')({ departmentId })).data;
}
export async function createDepartmentItem(departmentId: string, type: DepartmentItemType, title: string, details: string, dateMillis: number | null): Promise<void> {
  await httpsCallable<{ departmentId: string; type: DepartmentItemType; title: string; details: string; dateMillis: number | null }, { id: string }>(functions, 'createDepartmentItem')({ departmentId, type, title, details, dateMillis });
}
export async function updateDepartmentItem(
  departmentId: string,
  type: DepartmentItemType,
  itemId: string,
  action: 'complete' | 'reopen' | 'edit' | 'remove',
  changes?: { title: string; details: string; dateMillis: number | null },
): Promise<void> {
  await httpsCallable<{ departmentId: string; type: DepartmentItemType; itemId: string; action: string; changes?: { title: string; details: string; dateMillis: number | null } }, { updated: boolean }>(functions, 'updateDepartmentItem')({ departmentId, type, itemId, action, changes });
}
