export type InterfaceKind = 'msg' | 'srv' | 'action';
export interface InterfaceScaffoldInput {
  packageName: string;
  name: string;
  kind: InterfaceKind;
  fields: string[];
}

function valid(value: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(value);
}
export function interfaceScaffold(input: InterfaceScaffoldInput) {
  if (!valid(input.name))
    throw new Error(
      'Interface name must start with an uppercase letter and contain only letters or digits',
    );
  if (!input.fields.length) throw new Error('At least one interface field is required');
  const body = input.fields.join('\n') + '\n';
  const suffix = input.kind === 'msg' ? 'msg' : input.kind === 'srv' ? 'srv' : 'action';
  const content =
    input.kind === 'srv'
      ? `${body}\n---\n${body}`
      : input.kind === 'action'
        ? `${body}\n---\n${body}\n---\n${body}`
        : body;
  return {
    files: { [`${input.packageName}/${suffix}/${input.name}.${suffix}`]: content },
    packageChanges: [
      'Add rosidl_default_generators and rosidl_default_runtime dependencies',
      'Install the interface directory',
      'Register rosidl_generate_interfaces in the build system',
    ],
  };
}
