export interface ScaffoldInput { name: string; language: "python" | "cpp"; kind: "publisher" | "subscriber"; }
export function scaffold(input: ScaffoldInput) {
  const className = input.name.replace(/(^|[_-])(\w)/g, (_, _a, c) => c.toUpperCase());
  if (input.language === "python") return { files: { [`${input.name}/${input.name}.py`]: `#!/usr/bin/env python3\nimport rclpy\nfrom rclpy.node import Node\n\nclass ${className}(Node):\n    def __init__(self):\n        super().__init__("${input.name}")\n\ndef main():\n    rclpy.init()\n    node = ${className}()\n    rclpy.spin(node)\n    node.destroy_node()\n    rclpy.shutdown()\n\nif __name__ == "__main__":\n    main()\n` } };
  return { files: { [`${input.name}/src/${input.name}.cpp`]: `#include <rclcpp/rclcpp.hpp>\n\nclass ${className} final : public rclcpp::Node {\npublic:\n  ${className}() : Node("${input.name}") {}\n};\n\nint main(int argc, char ** argv) {\n  rclcpp::init(argc, argv);\n  rclcpp::spin(std::make_shared<${className}>());\n  rclcpp::shutdown();\n  return 0;\n}\n` } };
}
