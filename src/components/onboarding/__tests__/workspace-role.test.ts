import { describe, expect, it } from 'vitest';
import { WorkspaceRoleProvider } from '../workspace-role';

describe('workspace role provider', () => {
  // The workspace layout is a server component. A bare Context.Provider passed
  // across that boundary crashed every workspace page (React error #306).
  it('is a component, so a server layout can render it', () => {
    expect(typeof WorkspaceRoleProvider).toBe('function');
  });
  it('provides the role it is given', () => {
    expect(WorkspaceRoleProvider({ value: 'CALLER', children: null }).props.value).toBe('CALLER');
  });
});
