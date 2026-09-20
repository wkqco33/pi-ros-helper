export interface ScaffoldInput {
  name: string;
  language: 'python' | 'cpp';
  kind: 'publisher' | 'subscriber';
}

function className(name: string): string {
  return name.replace(/(^|[_-])(\w)/g, (_, _a: string, c: string) => c.toUpperCase());
}

function cppPublisher(name: string, type: string): string {
  return [
    '#include <chrono>',
    '#include <memory>',
    '',
    '#include <rclcpp/rclcpp.hpp>',
    '#include <std_msgs/msg/string.hpp>',
    '',
    `class ${type} final : public rclcpp::Node {`,
    'public:',
    `  ${type}() : Node("${name}") {`,
    `    publisher_ = create_publisher<std_msgs::msg::String>("/${name}", 10);`,
    '    timer_ = create_wall_timer(std::chrono::seconds(1), [this]() {',
    '      publisher_->publish(std_msgs::msg::String());',
    '    });',
    '  }',
    '',
    'private:',
    '  rclcpp::Publisher<std_msgs::msg::String>::SharedPtr publisher_;',
    '  rclcpp::TimerBase::SharedPtr timer_;',
    '};',
    '',
    'int main(int argc, char ** argv) {',
    '  rclcpp::init(argc, argv);',
    `  rclcpp::spin(std::make_shared<${type}>());`,
    '  rclcpp::shutdown();',
    '  return 0;',
    '}',
    '',
  ].join('\n');
}

function cppSubscriber(name: string, type: string): string {
  return [
    '#include <memory>',
    '',
    '#include <rclcpp/rclcpp.hpp>',
    '#include <std_msgs/msg/string.hpp>',
    '',
    `class ${type} final : public rclcpp::Node {`,
    'public:',
    `  ${type}() : Node("${name}") {`,
    '    subscription_ = create_subscription<std_msgs::msg::String>(',
    `        "/${name}", 10, [this](const std_msgs::msg::String::SharedPtr message) {`,
    '          (void)message;',
    '        });',
    '  }',
    '',
    'private:',
    '  rclcpp::Subscription<std_msgs::msg::String>::SharedPtr subscription_;',
    '};',
    '',
    'int main(int argc, char ** argv) {',
    '  rclcpp::init(argc, argv);',
    `  rclcpp::spin(std::make_shared<${type}>());`,
    '  rclcpp::shutdown();',
    '  return 0;',
    '}',
    '',
  ].join('\n');
}

function pythonPublisher(name: string, type: string): string {
  return [
    '#!/usr/bin/env python3',
    'import rclpy',
    'from rclpy.node import Node',
    'from std_msgs.msg import String',
    '',
    '',
    `class ${type}(Node):`,
    '    def __init__(self):',
    `        super().__init__("${name}")`,
    `        self.publisher_ = self.create_publisher(String, "/${name}", 10)`,
    '        self.timer_ = self.create_timer(1.0, self.publish)',
    '',
    '    def publish(self):',
    '        self.publisher_.publish(String())',
    '',
    '',
    'def main():',
    '    rclpy.init()',
    `    node = ${type}()`,
    '    rclpy.spin(node)',
    '    node.destroy_node()',
    '    rclpy.shutdown()',
    '',
    '',
    'if __name__ == "__main__":',
    '    main()',
    '',
  ].join('\n');
}

function pythonSubscriber(name: string, type: string): string {
  return [
    '#!/usr/bin/env python3',
    'import rclpy',
    'from rclpy.node import Node',
    'from std_msgs.msg import String',
    '',
    '',
    `class ${type}(Node):`,
    '    def __init__(self):',
    `        super().__init__("${name}")`,
    `        self.subscription_ = self.create_subscription(String, "/${name}", self.on_message, 10)`,
    '',
    '    def on_message(self, message):',
    '        self.get_logger().debug(f"received: {message.data}")',
    '',
    '',
    'def main():',
    '    rclpy.init()',
    `    node = ${type}()`,
    '    rclpy.spin(node)',
    '    node.destroy_node()',
    '    rclpy.shutdown()',
    '',
    '',
    'if __name__ == "__main__":',
    '    main()',
    '',
  ].join('\n');
}

export function scaffold(input: ScaffoldInput) {
  const type = className(input.name);
  if (input.language === 'python') {
    return {
      files: {
        [`${input.name}/${input.name}.py`]:
          input.kind === 'publisher'
            ? pythonPublisher(input.name, type)
            : pythonSubscriber(input.name, type),
      },
    };
  }
  return {
    files: {
      [`${input.name}/src/${input.name}.cpp`]:
        input.kind === 'publisher'
          ? cppPublisher(input.name, type)
          : cppSubscriber(input.name, type),
    },
  };
}
