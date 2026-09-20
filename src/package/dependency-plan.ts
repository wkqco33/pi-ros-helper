export interface DependencyPlan {
  referenced: string[];
  declared: string[];
  missing: string[];
  actions: string[];
}

const ROS_HEADER_PACKAGE: Record<string, string> = {
  rclcpp: 'rclcpp',
  rclcpp_action: 'rclcpp_action',
  rclcpp_lifecycle: 'rclcpp_lifecycle',
  sensor_msgs: 'sensor_msgs',
  std_msgs: 'std_msgs',
  geometry_msgs: 'geometry_msgs',
  nav_msgs: 'nav_msgs',
  tf2: 'tf2',
  tf2_ros: 'tf2_ros',
  builtin_interfaces: 'builtin_interfaces',
};

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function planDependencies(input: {
  packageXml: string;
  source: string;
  build: string;
}): DependencyPlan {
  const declared = unique(
    [
      ...input.packageXml.matchAll(
        /<(?:depend|build_depend|exec_depend|test_depend)>\s*([^<]+)\s*<\//g,
      ),
    ].map((match) => match[1]!.trim()),
  );
  const includes = [...input.source.matchAll(/#include\s*[<"]([A-Za-z0-9_]+)\//g)].map(
    (match) => match[1]!,
  );
  const findPackages = [...input.build.matchAll(/find_package\s*\(\s*([A-Za-z0-9_]+)/g)].map(
    (match) => match[1]!,
  );
  const referenced = unique([
    ...includes.map((name) => ROS_HEADER_PACKAGE[name] ?? name),
    ...findPackages,
  ]);
  const missing = referenced.filter((name) => !declared.includes(name));
  const actions = missing.flatMap((name) => [
    `Add <depend>${name}</depend> to package.xml.`,
    `Add find_package(${name} REQUIRED) and ament_target_dependencies target entry in CMakeLists.txt if it is used by C++ code.`,
  ]);
  return { referenced, declared, missing, actions };
}
