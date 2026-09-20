import { classifyColconOutput, type ColconFailure, type ColconFailureKind } from './colcon.ts';

export interface FailureDiagnosis {
  kind: ColconFailureKind;
  message: string;
  package?: string;
  suggestions: string[];
  failures: ColconFailure[];
}

const suggestions: Record<ColconFailureKind, string[]> = {
  compiler: [
    'Check the first compiler diagnostic before investigating downstream failures.',
    'If a ROS header is missing, compare package.xml and CMakeLists.txt dependencies.',
  ],
  linker: ['Check target_link_libraries and exported package dependencies.'],
  cmake: [
    'Inspect the first CMake error and verify the requested package is installed and sourced.',
  ],
  rosidl: ['Verify interface definitions and rosidl_generate_interfaces dependencies.'],
  python: ['Verify the Python dependency and the sourced ROS environment.'],
  test: [
    'Run the failing test target directly after rebuilding the affected package.',
    'If this is a gtest matcher error, include the appropriate gtest matcher header or use a standard assertion.',
  ],
  unknown: ['Inspect the first failure line and rerun with focused output.'],
};

export function diagnoseColconFailure(output: string): FailureDiagnosis {
  const failures = classifyColconOutput(output);
  const first = failures[0] ?? {
    kind: 'unknown' as const,
    message: 'No actionable colcon failure was found.',
  };
  return {
    kind: first.kind,
    message: first.message,
    package: first.package,
    suggestions: suggestions[first.kind],
    failures,
  };
}
