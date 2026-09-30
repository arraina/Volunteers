import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export type DepartmentRole = 'admin' | 'member';
export interface Department { id: string; name: string; description: string; sortOrder: number; }
export interface DepartmentMembership { id: string; departmentId: string; userId: string; role: DepartmentRole; name: string; }
export interface DepartmentDirectoryResult { isOwner: boolean; managedDepartmentIds: string[]; departments: Department[]; memberships: DepartmentMembership[]; }

export async function initializeDepartments(): Promise<void> {
  await httpsCallable<Record<string, never>, { created: number }>(functions, 'initializeDepartments')({});
}
export async function getDepartmentDirectory(): Promise<DepartmentDirectoryResult> {
  return (await httpsCallable<Record<string, never>, DepartmentDirectoryResult>(functions, 'getDepartmentDirectory')({})).data;
}
export async function setDepartmentMembership(departmentId: string, userId: string, role: DepartmentRole, active: boolean): Promise<void> {
  await httpsCallable<{ departmentId: string; userId: string; role: DepartmentRole; active: boolean }, { updated: boolean }>(functions, 'setDepartmentMembership')({ departmentId, userId, role, active });
}
