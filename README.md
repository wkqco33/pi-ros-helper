# pi-ros-helper

[pi 코딩 에이전트](https://github.com/badlogic/pi-mono)를 위한 ROS 2 개발 도구 확장 패키지입니다.

## 현재 지원 현황

버전 `0.1.10`은 내장된 `ros2-development` 스킬에 정의된 범위 제한(bounded) 검사, 품질 게이트, 명시적 확인 기반 제어 도구를 제공합니다:

### 정적 분석, 작업 공간 및 패키징 (Static Analysis, Workspace & Packaging)
- `ros_environment` — ROS 배포판(distro), RMW, 도메인 ID, 환경 설정 파일 및 작업 공간 탐색 상태 검사
- `ros_workspace_inspect` — 작업 공간 내 패키지 목록 열거, 중복 패키지명 감지, 루트 기반 단일 패키지 리포지토리 감지
- `ros_package_analyze` — `package.xml`과 CMake/Python 빌드 파일 비교 분석 (패키지명, 디렉터리 경로 또는 매니페스트 파일 경로 지원)
- `ros_dependency_plan` — C++ `#include` 및 CMake 참조로부터 미선언된 의존성을 감지하고 파일 수정 없이 매니페스트/빌드 변경 계획 미리보기 제공
- `ros_parameter_validate` — 실행 중인 노드를 변경하지 않고 선언된 파라미터 타입과 구성 설정값(YAML 등) 비교 검증
- `ros_launch_analyze` — Python 및 XML 런치 파일 내 노드, 인자, include 파일, 리매핑 정적 분석
- `ros_launch_validate` — 노드를 실행하지 않고 런치 include 파일 누락 및 정적 노드 정의 유효성 검증
- `ros_launch_preview` — 프로세스를 실행하지 않고 런치 구성 및 실행 명령 미리보기

### 빌드, 테스트 및 장애 진단 (Build, Test & Failure Diagnosis)
- `ros_build` — 제한된(bounded) `colcon build` 미리보기 또는 명시적 실행; 파일, 플래그, 빈도별 컴파일러 경고 요약
- `ros_test` — `colcon test` 미리보기 또는 명시적 실행; 실패한 테스트 케이스를 바이너리, 스위트, 소스 파일, 라인 번호 단위로 추적하며 테스트 바이너리가 소스보다 오래된 경우 경고(`STALE_TEST_ARTIFACTS`) 발생; 선택된 `testTargets`에 대해 안전한 CTest 정규식 필터링 및 테스트 결과 수집 범위 제한 지원
- `ros_test_select` — 테스트를 직접 실행하지 않고 변경된 소스 경로와 연관된 집중 테스트 대상 선별
- `ros_failure_diagnose` — 첫 번째 실행 가능한 colcon/컴파일러/CMake/rosidl 실패 원인을 분류하고 맞춤형 해결 가이드 제시
- `ros_log_analyze` — ROS 데몬, colcon 빌드, 테스트 로그에서 오류, 경고 및 실패한 테스트 케이스 요약

### 검증 및 완료 게이트 (Validation & Completion Gates)
- `ros_validation_bundle` — 빌드 후 테스트 연계 시퀀스 미리보기 또는 실행; 선택적 `testTargets` 기반 집중 테스트 필터링 및 결과 범위 제한 지원, 오래된(stale) 테스트 아티팩트 감지 시 게이트 실패 처리
- `ros_tdd_checkpoint` — 소스 코드 변경에 부합하는 연관 테스트 코드 변경이 있는지 검증
- `ros_completion_evidence` — 실행된 빌드 및 테스트 결과를 기반으로 구현 완료 여부를 보수적으로 판정
- `ros_graph_assert` — 기대하는 노드, 토픽, 서비스 구성과 활성 ROS 그래프 상태 비교 검증

### 런타임 검사 및 진단 (Runtime Inspection & Diagnostics)
- `ros_graph_snapshot` — 활성 노드, 토픽, 서비스의 제한된 스냅샷 캡처
- `ros_graph_diff` — 두 그래프 스냅샷을 비교하여 라이프사이클 전이 또는 런타임 토폴로지 변화 감지
- `ros_qos_check` — 엔드포인트 QoS 정책을 점검하고 요청/제공(requested/offered) 불일치(신뢰성, 내구성) 감지
- `ros_tf_diagnose` — `tf2_echo`를 사용하여 제한된 타임아웃 내에서 두 좌표계 프레임 간 변환 진단
- `ros_param_inspect` — 실행 중인 ROS 2 노드의 파라미터 값 및 타입 조회
- `ros_param_diff` — 실행 중인 노드 간 파라미터 비교 또는 변경 내역 안전하게 비교
- `ros_topic_sample` — 타임아웃 및 크기 제한 내에서 토픽으로부터 단일 메시지 캡처
- `ros_bag_inspect` — rosbag 메타데이터, 저장소 포맷, 토픽 통계 정보 검사
- `ros_bag_query` — 기록된 rosbag 파일 내 메시지 및 요약 데이터 조회

### 확인이 필요한 제어 작업 (Confirmed Control Operations)
- `ros_topic_publish` — 토픽으로 단일 메시지 발행; 고위험 구동계 토픽(`cmd_vel`, 액추에이터, 모터 등)을 자동 식별하며 대화형 명시적 확인 필수
- `ros_service_call` — 제한된 타임아웃 및 대화형 확인을 거쳐 ROS 2 서비스 호출
- `ros_action_goal` — 대화형 확인을 거쳐 액션 목표(goal)를 전송하고 피드백/결과 보고
- `ros_lifecycle_transition` — 대화형 확인을 거쳐 라이프사이클 노드 상태 전이(configure, activate, deactivate, cleanup, shutdown) 트리거

### 스캐폴딩 및 코드 생성 (Scaffolding & Code Generation)
- `ros_scaffold_preview` — C++ 및 Python 노드 스캐폴드 미리보기 (퍼블리셔, 서브스크라이버, 파라미터/타이머 노드)
- `ros_package_scaffold` — 신규 ament_cmake 또는 ament_python 패키지 구조 생성 (기존 파일 절대 덮어쓰지 않음)
- `ros_package_scaffold_preview` — 패키지 매니페스트 및 빌드 파일 템플릿 미리보기
- `ros_interface_scaffold_preview` — 사용자 정의 msg, srv, action 인터페이스 정의 미리보기

### 대화형 명령어 (Interactive Commands)
- `/ros-status` — 간결한 대화형 ROS 상태 알림

---

### 안전 기본 원칙 (Safe by Default)
- `ros_build` 및 `ros_validation_bundle`은 `execute: true`가 명시적으로 전달되지 않으면 명령을 실행하지 않고 미리보기만 반환합니다.
- `colcon test`는 자동으로 재빌드하지 않습니다. 소스 코드를 수정한 후에는 반드시 `ros_build`를 실행해야 합니다. 테스트 바이너리가 오래된 경우 `ros_test`가 `STALE_TEST_ARTIFACTS` 경고를 출력합니다.
- 토픽 발행, 서비스 호출, 액션 목표 전송, 라이프사이클 전이 등 시스템 상태를 변경하는 제어 작업은 항상 명시적인 사용자 확인을 요구하며 비대화형 모드에서 임의로 실행되지 않습니다.

## 개발용 설치 (Install for development)

```bash
pi -e /absolute/path/to/pi-ros-helper
```

프로젝트 로컬 패키지로 사용하려면 `.pi/settings.json`에 경로를 추가하거나 npm 패키지를 설치합니다:

```bash
pi install npm:pi-ros-helper@latest
```

GitHub Actions 릴리스 워크플로는 `v0.1.0`과 같은 GitHub 릴리스 태그를 출처 증명(provenance)과 함께 npm에 배포합니다. 태그는 `package.json`의 버전과 일치해야 합니다.

## 개발 및 기여 (Development)

```bash
npm install
npm test
npm run typecheck
# 또는 전체 검사 실행
npm run check
```

이 확장은 로드 시 ROS가 반드시 설치되어 있을 필요는 없습니다. ROS 관련 도구는 `ros2`, `rclpy` 또는 작업 공간을 사용할 수 없을 때 예외를 던지지 않고 구조화된 진단 오류를 반환합니다.

## 지원 및 호환성 (Support and compatibility)

- Node.js 20 이상
- ROS 2 Jazzy 및 Humble 우선 지원
- 런타임 도구는 소싱된 ROS 환경이 필요하며, 정적 작업 공간 및 패키지 분석 도구는 ROS 설치 없이도 작동합니다.
- 작업 공간 탐색은 표준 colcon `src` 구조와 루트에 `package.xml`이 위치한 단일 패키지 리포지토리를 모두 지원합니다.
- 라이선스: Apache-2.0 (`LICENSE` 참조)

릴리스 이력은 `CHANGELOG.md`, 개발 규칙은 `AGENTS.md`, 지원 런타임 정보는 `docs/compatibility.md`, 취약점 보고는 `SECURITY.md`를 참고하세요.

## 설계 원칙 (Design principles)

- 모호한 쉘 텍스트 대신 구조화된 결과 반환
- 타임아웃, 작업 취소, 출력 크기 제한을 통한 프로세스 경계 유지
- 사용자 입력 경로/패키지명의 쉘 문자열 보간 금지 (안전한 인자 분리)
- 기본적으로 읽기 전용 진단 수행
- 빌드/테스트 실행 시 명시적 opt-in 요구
- 토픽 발행은 1회성 메시지로 제한되며 대화형 확인 필수
- ROS 2 Humble 및 Jazzy 호환성 유지

## 런타임 환경 (Runtime environment)

런타임 도구(그래프 스냅샷, QoS 점검, TF 진단, 토픽 샘플링, 제어 도구)는 ROS 2 환경(예: `source /opt/ros/jazzy/setup.bash` 또는 로컬 작업 공간)이 소싱되어 있어야 합니다. ROS CLI 또는 데몬에 접근할 수 없는 경우 예외로 중단되지 않고 구조화된 진단 결과를 반환합니다.
