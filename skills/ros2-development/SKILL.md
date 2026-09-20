---
name: ros2-development
description: pi-ros-helper를 활용한 ROS 2 개발 워크플로. ROS 2 환경, 작업 공간, 패키지 점검, colcon 빌드/테스트, 런타임 그래프, QoS, TF, 토픽, 파라미터, 로그, 런치, rosbag 문제 진단 및 스캐폴딩 시 사용합니다.
license: Apache-2.0
---

# pi-ros-helper를 활용한 ROS 2 개발 워크플로

원시 쉘 명령어(raw shell commands)를 직접 실행하기 전에 ROS 전용 도구를 우선 사용하세요.

## 조사 및 작업 순서 (Investigation order)

1. ROS 설정이나 작업 공간 상태가 불확실할 때는 `ros_environment`를 실행하세요.
2. 빌드 대상을 선택하기 전에 `ros_workspace_inspect`를 실행하세요. 표준 colcon `src` 구조와 루트에 `package.xml`이 있는 단일 패키지 구조를 모두 자동 탐색합니다.
3. `package.xml`이나 빌드 파일을 편집하기 전에 패키지명 또는 경로를 지정하여 `ros_package_analyze`를 사용하세요.
4. `package.xml` 또는 `CMakeLists.txt`를 수정하기 전에 `ros_dependency_plan`을 사용하세요. 파일을 직접 변경하지 않고 미선언된 의존성을 미리 확인하고 변경 계획을 세울 수 있습니다.
5. 파라미터 YAML 또는 런치 파일 값을 수정하기 전에 `ros_parameter_validate`를 사용하세요. 미선언되거나 타입이 불일치하는 파라미터는 구성 오류로 취급해야 합니다.
6. 런치 파일을 실행하기 전에 `ros_launch_validate`를 사용하세요. (정적 검증만으로는 동적 Python 런치 동작을 완벽히 보장할 수 없음을 유의하세요.)
7. 빌드 실패 발생 시, 제한된 출력에 대해 `ros_failure_diagnose`를 실행하고 후속 실패 이전에 가장 먼저 발생한 컴파일러/CMake/rosidl 오류를 확인하세요.
8. 소스 코드 수정 후에는 `ros_test_select`로 집중 테스트 대상을 선택하거나, 재빌드와 테스트를 단일 완료 게이트로 묶어 다룰 때 `ros_validation_bundle`을 사용하세요.
9. `colcon test`는 자동으로 재빌드하지 않습니다. 소스나 테스트 코드를 수정한 후에는 `ros_test` 전에 반드시 `ros_build`를 실행해야 합니다. `STALE_TEST_ARTIFACTS` 경고는 테스트 바이너리가 소스 코드보다 오래되었음을 의미합니다.
10. 작업 완료를 보고하기 전에 `ros_tdd_checkpoint`와 `ros_completion_evidence`를 사용하여 검증을 완수하세요.
11. 런치 또는 통합 변경 후 기대하는 그래프 형상을 알고 있는 경우 `ros_graph_assert`를 사용하세요.
12. 런타임 통신 장애가 발생한 경우: 그래프(Graph) → 타입(Type) → QoS → TF 순서로 점검하세요.
13. 토픽 데이터 수집은 항상 제한된(bounded) 크기/시간으로 수행하세요. 종료 조건이 없는 `ros2 topic echo`를 절대 실행하지 마세요.

## 안전 규칙 (Safety)

- `ros_build`와 `ros_validation_bundle`은 명령을 먼저 미리보기로 반환하며, `execute: true`가 명시적으로 전달되어야만 실행됩니다.
- 토픽 발행, 파라미터 변경, 액션 전송, 라이프사이클 노드 전이와 같은 런타임 제어 명령은 명시적인 사용자 확인을 요구하며 비대화형 모드에서 임의로 실행되지 않습니다.
- `/cmd_vel`, 액추에이터(actuator), 모터(motor), 비상 정지(emergency), 셧다운(shutdown) 토픽은 고위험으로 분류됩니다. 제한된 동작 시간(finite duration), 주기(rate), 그리고 사용자의 확인 없이 반복 명령을 전송하지 마세요.
