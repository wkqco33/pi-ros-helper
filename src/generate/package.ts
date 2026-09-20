export interface PackageScaffoldInput { packageName: string; language: "python" | "cpp"; nodeName: string; }
export function packageScaffold(input: PackageScaffoldInput) {
  const py = input.language === "python";
  const files: Record<string, string> = {};
  files[`${input.packageName}/package.xml`] = `<?xml version="1.0"?>\n<package format="3">\n  <name>${input.packageName}</name>\n  <version>0.1.0</version>\n  <description>ROS 2 package</description>\n  <maintainer email="todo@example.com">TODO</maintainer>\n  <license>Apache-2.0</license>\n  <buildtool_depend>ament_${py ? "python" : "cmake"}</buildtool_depend>\n  <depend>rcl${py ? "py" : "cpp"}</depend>\n  <export><build_type>ament_${py ? "python" : "cmake"}</build_type></export>\n</package>\n`;
  if (py) {
    files[`${input.packageName}/setup.py`] = `from setuptools import setup\n\npackage_name = '${input.packageName}'\nsetup(name=package_name, version='0.1.0', packages=[package_name], entry_points={'console_scripts': ['${input.nodeName} = ${input.packageName}.${input.nodeName}:main']})\n`;
    files[`${input.packageName}/${input.packageName}/__init__.py`] = "";
    files[`${input.packageName}/${input.packageName}/${input.nodeName}.py`] = `import rclpy\nfrom rclpy.node import Node\n\nclass ${input.nodeName}(Node):\n    def __init__(self):\n        super().__init__('${input.nodeName}')\n\ndef main():\n    rclpy.init()\n    node = ${input.nodeName}()\n    rclpy.spin(node)\n    node.destroy_node()\n    rclpy.shutdown()\n`;
  } else {
    files[`${input.packageName}/CMakeLists.txt`] = `cmake_minimum_required(VERSION 3.8)\nproject(${input.packageName})\nfind_package(ament_cmake REQUIRED)\nfind_package(rclcpp REQUIRED)\nadd_executable(${input.nodeName} src/${input.nodeName}.cpp)\nament_target_dependencies(${input.nodeName} rclcpp)\ninstall(TARGETS ${input.nodeName} DESTINATION lib/${input.packageName})\nament_package()\n`;
    files[`${input.packageName}/src/${input.nodeName}.cpp`] = `#include <rclcpp/rclcpp.hpp>\nint main(int argc, char **argv) { rclcpp::init(argc, argv); rclcpp::spin(std::make_shared<rclcpp::Node>("${input.nodeName}")); rclcpp::shutdown(); return 0; }\n`;
  }
  return { files };
}
