# pi-ros-helper

[pi 코딩 에이전트](https://github.com/badlogic/pi-mono)를 위한 ROS 2 개발 도구 및 안전 워크플로우 확장 패키지입니다.

ROS 2 작업 공간 및 패키지의 **정적 분석**부터 **스마트 빌드/테스트, 실패 진단, 품질 게이트, 런타임 상태 진단, 대화형 확인 기반 제어**까지 지원하며, ROS 2 환경이 없는 시스템에서도 오류 없이 안전하게 진단 결과를 반환하도록 설계되었습니다.

---

## 설치 및 설정 (Installation)

### 패키지 설치
pi 환경에 npm 패키지로 설치합니다:

```bash
pi install npm:pi-ros-helper
```

### 개발용/로컬 설치
로컬에서 소스 코드로 직접 로드하려면 다음과 같이 실행합니다:

```bash
pi -e /absolute/path/to/pi-ros-helper
```

또는 프로젝트의 `.pi/settings.json`에 확장 경로를 등록할 수 있습니다.

### ROS 2 환경 준비
런타임 도구(그래프 점검, QoS, TF, 제어 도구 등)를 사용하려면 터미널 세션에 ROS 2 환경 설정이 소싱되어 있어야 합니다:

```bash
source /opt/ros/jazzy/setup.bash  # 또는 humble, 로컬 작업 공간의 install/setup.bash
```

> 💡 정적 패키지 분석, 워크스페이스 구조 탐색, C++ include 의존성 계획, 스캐폴딩 등은 ROS가 설치되어 있지 않은 환경에서도 정상 작동합니다.

---

## 빠른 시작 (Quick Start)

설치 후 pi 대화창에서 인터랙티브 명령어로 ROS 2 환경 상태를 즉시 확인할 수 있습니다:

```text
/ros-status
```

현재 감지된 ROS 배포판(Humble/Jazzy 등), RMW 구현체, 도메인 ID, 작업 공간 루트 및 패키지 수를 간결하게 요약하여 보고합니다.

또한, 내장된 `ros2-development` 스킬이 pi 에이전트에게 상황별 권장 도구 호출 순서(조사 순서, 안전 규칙, 런타임 통신 장애 해결 절차)를 자동으로 안내합니다.

---

## 개발 워크플로우 가이드 (Workflow Guide)

ROS 2 프로젝트 개발 시 권장하는 워크플로우와 주요 기능 가이드입니다. 원시 쉘 명령어(`colcon build`, `ros2 topic echo` 등)를 직접 실행하기 전에 전용 도구를 활용하세요.

### 1. 작업 공간 및 패키지 정적 진단 (Workspace & Packaging)
빌드하기 전에 패키지 매니페스트와 의존성의 정합성을 검증합니다.
- **작업 공간 탐색**: 표준 colcon `src` 구조뿐 아니라 리포지토리 루트에 `package.xml`이 위치한 단일 패키지 구조도 자동으로 감지합니다 (`ros_workspace_inspect`, `ros_environment`).
- **패키지 정합성 분석**: `package.xml`과 `CMakeLists.txt` 또는 `setup.py` 간 선언 내용의 불일치를 분석합니다 (`ros_package_analyze`).
- **의존성 계획 미리보기**: C++ `#include` 및 CMake 참조를 스캔하여 선언되지 않은 ROS 의존성을 감지하고, 파일 수정 없이 매니페스트/빌드 변경 계획을 미리 확인합니다 (`ros_dependency_plan`).
- **파라미터 및 런치 정적 검증**: 
  - 노드를 실행하지 않고 선언된 파라미터 타입과 YAML 설정값의 불일치를 검증합니다 (`ros_parameter_validate`).
  - 런치 파일(Python/XML)의 include 누락, 리매핑, 정적 노드 구성을 분석 및 검증합니다 (`ros_launch_analyze`, `ros_launch_validate`, `ros_launch_preview`).

### 2. 스마트 빌드, 테스트 및 장애 진단 (Build, Test & Diagnostics)
전체 재빌드나 무차별 테스트 대신 변경 사항 중심의 신속한 루프를 제공합니다.
- **집중 테스트 선별**: 소스 파일 변경 경로를 분석하여 연관된 패키지 및 CTest 대상을 자동으로 선별합니다 (`ros_test_select`).
- **제한된 colcon 빌드**: 컴파일러 경고를 파일·플래그·빈도별로 요약하며 안전한 옵트인 방식으로 빌드합니다 (`ros_build`).
- **바이너리 신선도 점검 테스트**: `colcon test`는 자동으로 재빌드하지 않으므로, 테스트 바이너리가 소스 코드보다 오래된 경우(`STALE_TEST_ARTIFACTS`) 경고를 발생시킵니다 (`ros_test`). 선택된 대상에 대해 안전한 CTest 정규식 필터링을 지원합니다.
- **실패 원인 우선 진단**: 컴파일러/CMake/rosidl/테스트 실패 시, 후속 에러에 가려지지 않도록 **가장 먼저 발생한 근본 원인**을 추출하여 해결 가이드를 제시합니다 (`ros_failure_diagnose`, `ros_log_analyze`).

### 3. 품질 검증 게이트 (Validation Gates)
작업 완료를 확정하기 전에 구조화된 검증 증거를 확보합니다.
- **TDD 체크포인트**: 소스 코드 수정에 대응하는 테스트 코드 변경이 함께 이루어졌는지 확인합니다 (`ros_tdd_checkpoint`).
- **검증 번들**: 빌드 후 테스트 연계 시퀀스를 실행하고 오래된 테스트 아티팩트를 방지합니다 (`ros_validation_bundle`).
- **완료 증거 검증**: 실제 실행된 빌드 및 테스트 통과 기록을 기반으로 작업 완료 여부를 보수적으로 판정합니다 (`ros_completion_evidence`).
- **그래프 형상 단언**: 런치 파일 실행 후 기대하는 노드, 토픽, 서비스 토폴로지가 실제 ROS 그래프에 형성되었는지 검증합니다 (`ros_graph_assert`).

### 4. 런타임 진단 및 트러블슈팅 (Runtime Diagnostics)
런타임 통신 장애가 발생했을 때 권장 점검 순서: **그래프(Graph) → 메시지 타입(Type) → QoS → TF**
- **그래프 스냅샷 및 차분**: 활성 노드·토픽·서비스 스냅샷을 캡처하고, 전후 비교를 통해 토폴로지 변화나 라이프사이클 전이를 감지합니다 (`ros_graph_snapshot`, `ros_graph_diff`).
- **QoS 호환성 점검**: 퍼블리셔-서브스크라이버 간의 신뢰성(Reliability) 및 내구성(Durability) 불일치를 진단합니다 (`ros_qos_check`).
- **좌표계 TF 진단**: 제한된 타임아웃 내에서 두 프레임 간의 변환 유효성을 점검합니다 (`ros_tf_diagnose`).
- **안전한 토픽 샘플링**: 종료 조건 없이 터미널을 멈추게 하는 `ros2 topic echo` 대신, 1회성/크기 제한 기반으로 안전하게 메시지를 캡처합니다 (`ros_topic_sample`).
- **파라미터 및 rosbag 분석**: 실행 중인 노드의 파라미터 조회/비교 및 rosbag 메타데이터/메시지 조회를 지원합니다 (`ros_param_inspect`, `ros_bag_inspect`, `ros_bag_query`).

### 5. 안전한 런타임 제어 및 스캐폴딩 (Safe Control & Scaffolding)
- **대화형 확인 필수 제어**: 시스템 상태를 변경하는 토픽 발행, 서비스 호출, 액션 목표 전송, 라이프사이클 노드 전이는 사용자 확인 없이 임의로 실행되지 않습니다.
- **스캐폴딩**: ament_cmake / ament_python 패키지 템플릿 생성 및 퍼블리셔, 서브스크라이버, 파라미터/타이머 노드 보일러플레이트 미리보기를 제공합니다 (`ros_package_scaffold`, `ros_scaffold_preview`, `ros_interface_scaffold_preview`). 기존 파일은 절대 덮어쓰지 않습니다.

---

## 핵심 원칙 및 안전 모델 (Core Principles & Safety)

### 1. 명시적 옵트인 기반 안전 실행 (Safe by Default)
- `ros_build` 및 `ros_validation_bundle`은 `execute: true`가 명시적으로 지정되지 않으면 명령을 실행하지 않고 **미리보기(preview)**만 반환합니다.
- 패키지 및 노드 스캐폴딩 도구는 기존에 존재하는 파일을 절대 덮어쓰지 않습니다.

### 2. 고위험 구동계 보호 (Actuation Safety)
- `/cmd_vel`, 모터, 액추에이터, 비상 정지(emergency stop), 셧다운 관련 토픽은 고위험으로 자동 분류됩니다.
- 위험 명령은 반드시 **제한된 동작 시간(finite duration)**과 **주기(rate)**를 가져야 하며, 비대화형 모드에서 에이전트가 임의로 반복 전송할 수 없습니다.

### 3. 오래된 테스트 아티팩트 감지 (Stale Test Artifact Detection)
- ROS 2의 `colcon test`는 테스트 실행 전 소스 코드를 자동으로 컴파일하지 않습니다.
- 소스 코드가 변경되었는데 테스트 바이너리가 새로 빌드되지 않은 상태에서 테스트가 통과하면 잘못된 성공 판정으로 이어질 수 있습니다. `pi-ros-helper`는 바이너리와 소스의 mtime을 대조하여 `STALE_TEST_ARTIFACTS`를 감지하고 검증 게이트를 차단합니다.

### 4. 엄격한 프로세스 경계 유지
- 모든 서브프로세스 호출은 명시적인 타임아웃, 출력 버퍼 크기 제한, `AbortSignal` 작업 취소 기능을 갖추고 있습니다.
- 사용자 입력값(경로, 패키지명, 토픽명)을 쉘 문자열로 직접 보간하지 않고 항상 안전하게 배열 인자로 분리하여 호출합니다.

---

## 문서 및 참고 자료 (Documentation)

- 🧭 **[호환성 매트릭스 (docs/compatibility.md)](docs/compatibility.md)** — Node.js, ROS 2(Humble/Jazzy), Ubuntu, Python 호환성 및 저하 모드 동작
- 📝 **[변경 이력 (CHANGELOG.md)](CHANGELOG.md)** — 버전별 릴리스 변경 사항
- 🤝 **[개발 가이드 및 에이전트 규칙 (AGENTS.md)](AGENTS.md)** — 구현 가이드라인, 안전 규칙 및 기여 지침
- 🔒 **[보안 정책 (SECURITY.md)](SECURITY.md)** — 취약점 보고 및 보안 지침

---

## 개발 및 기여 (Development)

```bash
# 의존성 설치
npm install

# 단위 테스트 및 타입 검사
npm test
npm run typecheck

# 전체 검증 (테스트, 타입 검사, 코드 포맷, 패키징 검사)
npm run check
```

- ROS 환경이 없는 시스템에서도 스텁과 파서 단위 테스트가 안전하게 동작합니다.
- 런타임 기능 검증 시에는 ROS 2 환경을 소싱한 터미널에서 테스트를 수행하세요.

---

## 라이선스 (License)

Apache-2.0 (`LICENSE` 파일 참조)
