export function canShareTask(uid: string | undefined, isOwner: boolean, isAdmin: boolean, createdBy?: string): boolean {
  return !!uid && (isOwner || (isAdmin && !!createdBy && createdBy === uid));
}
