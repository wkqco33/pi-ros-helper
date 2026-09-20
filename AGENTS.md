# 개발 가이드 (Development guide)

## 적용 범위 (Scope)

`pi-ros-helper`는 범위 제한(bounded) ROS 2 검사 및 명시적 확인 기반 제어 도구를 제공하는 TypeScript 기반 pi 패키지입니다. ROS가 설치되어 있지 않은 환경에서도 런타임 진단 기능을 정상적으로 사용할 수 있어야 하며, 확장 패키지 시작 시 예외를 던지는 대신 구조화된 오류를 반환해야 합니다.

## 개발 명령어 (Commands)

```bash
npm install
npm test
npm run typecheck
npm run check
pi -e ./extensions/index.ts --list-models
```

ROS 2가 설치된 환경에서는 런타임 점검 전에 환경 설정 파일을 먼저 소싱하세요:

```bash
source /opt/ros/jazzy/setup.bash
ros2 topic list -t
```

## 구현 규칙 (Implementation rules)

- 사용자 입력을 쉘 문자열로 직접 보간(interpolation)하지 말고, 반드시 `pi.exec` 또는 공용 러너(`runCommand`)를 사용하세요.
- 서브프로세스는 타임아웃, 작업 취소(AbortSignal), 출력 크기 제한을 적용하여 실행 범위를 엄격히 제한(bounded)하세요.
- 모든 도구는 공통 `RosToolResult` 규격의 형태를 반환해야 합니다.
- 읽기 전용 작업은 자동으로 실행할 수 있지만, 토픽 발행, 서비스 호출, 액션 목표 전송, 라이프사이클 노드 전이 및 파일 쓰기 작업은 반드시 명시적인 옵트인과 대화형 확인(interactive confirmation)을 거쳐야 합니다.
- 스캐폴드 생성 시 기존 파일을 절대 덮어쓰지 마세요.
- 파라미터 출력에 포함될 수 있는 비밀 정보(secret/credential)는 마스킹(redact) 처리하세요.
- ROS API 차이가 있는 경우 Humble 및 Jazzy 간 호환성을 유지하세요.
- 완료 판단은 보수적으로 진행하세요: 작업 완료를 선언하기 전에 오래된 테스트 아티팩트(`ros_completion_evidence`, `ros_tdd_checkpoint`) 없이 빌드와 테스트가 실제로 실행되어 성공했는지 검증해야 합니다.

## 테스트 규칙 (Testing rules)

모든 파서, 정규화기, 안전 규칙 또는 순수 생성기 변경에 대해 단위 테스트를 작성하세요. 커밋하기 전에 반드시 `npm test`, `npm run typecheck`, `npm run check`를 실행하세요. 런타임 ROS 변경사항은 소싱된 Jazzy 작업 공간에서도 검증해야 하며, ROS 의존성을 사용할 수 없는 환경이라는 이유로 테스트 검증 강도를 약화시키지 마세요.

## 커밋 규칙 (Commit rules)

`feat:`, `fix:`, `test:`, `docs:`, `chore:` 등 명확한 목적의 Conventional Commits 형식을 사용하세요. `node_modules`, Python 바이트코드(`.pyc`, `__pycache__`), 생성된 rosbag, 로그, 비밀 정보 및 인증 정보는 절대 커밋하지 마세요.
