CREATE TABLE users (
  id VARCHAR(191) PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN','QA_MANAGER','TESTER','VIEWER') NOT NULL DEFAULT 'TESTER',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE projects (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  project_key VARCHAR(50) NOT NULL UNIQUE,
  base_url VARCHAR(500),
  environments JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE test_cases (
  id VARCHAR(191) PRIMARY KEY,
  project_id VARCHAR(191) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  group_type ENUM('SMOKE','REGRESSION','RELEASE','SPRINT','CUSTOM') NOT NULL DEFAULT 'CUSTOM',
  priority ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  status ENUM('DRAFT','READY','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  tags JSON,
  created_by_id VARCHAR(191),
  updated_by_id VARCHAR(191),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_test_cases_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_test_cases_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
  CONSTRAINT fk_test_cases_updated_by FOREIGN KEY (updated_by_id) REFERENCES users(id)
);

CREATE TABLE test_steps (
  id VARCHAR(191) PRIMARY KEY,
  test_case_id VARCHAR(191) NOT NULL,
  step_number INT NOT NULL,
  action_type ENUM('goto','click','type','select','verify_text','wait','upload_file','download_file','screenshot') NOT NULL,
  locator_type ENUM('css','xpath','text','role','label','placeholder'),
  locator_value TEXT,
  input_value TEXT,
  expected_result TEXT,
  wait_ms INT,
  timeout_ms INT,
  metadata JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ux_test_steps_order (test_case_id, step_number),
  CONSTRAINT fk_test_steps_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);

CREATE TABLE test_suites (
  id VARCHAR(191) PRIMARY KEY,
  project_id VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  suite_type ENUM('SMOKE','REGRESSION','RELEASE','SPRINT','CUSTOM') NOT NULL DEFAULT 'CUSTOM',
  description TEXT,
  created_by_id VARCHAR(191),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ux_suite_project_name (project_id, name),
  CONSTRAINT fk_test_suites_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_test_suites_created_by FOREIGN KEY (created_by_id) REFERENCES users(id)
);

CREATE TABLE test_suite_mapping (
  test_suite_id VARCHAR(191) NOT NULL,
  test_case_id VARCHAR(191) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (test_suite_id, test_case_id),
  CONSTRAINT fk_mapping_suite FOREIGN KEY (test_suite_id) REFERENCES test_suites(id) ON DELETE CASCADE,
  CONSTRAINT fk_mapping_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);

CREATE TABLE test_runs (
  id VARCHAR(191) PRIMARY KEY,
  project_id VARCHAR(191) NOT NULL,
  test_suite_id VARCHAR(191),
  test_case_id VARCHAR(191),
  status ENUM('QUEUED','RUNNING','PASSED','FAILED','SKIPPED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  browser ENUM('chromium','chrome','firefox','webkit') NOT NULL DEFAULT 'chromium',
  headless BOOLEAN NOT NULL DEFAULT TRUE,
  environment VARCHAR(100) NOT NULL DEFAULT 'qa',
  base_url VARCHAR(500),
  triggered_by_id VARCHAR(191),
  started_at DATETIME,
  ended_at DATETIME,
  duration_ms INT,
  summary JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_runs_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_runs_suite FOREIGN KEY (test_suite_id) REFERENCES test_suites(id),
  CONSTRAINT fk_runs_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id),
  CONSTRAINT fk_runs_user FOREIGN KEY (triggered_by_id) REFERENCES users(id)
);

CREATE TABLE test_step_results (
  id VARCHAR(191) PRIMARY KEY,
  test_run_id VARCHAR(191) NOT NULL,
  test_step_id VARCHAR(191),
  step_number INT NOT NULL,
  status ENUM('QUEUED','RUNNING','PASSED','FAILED','SKIPPED','CANCELLED') NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  locator_type VARCHAR(50),
  locator_value TEXT,
  message TEXT,
  error TEXT,
  screenshot_path VARCHAR(1000),
  trace_path VARCHAR(1000),
  video_path VARCHAR(1000),
  duration_ms INT,
  started_at DATETIME,
  ended_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_step_results_run FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_step_results_step FOREIGN KEY (test_step_id) REFERENCES test_steps(id)
);

CREATE TABLE logs (
  id VARCHAR(191) PRIMARY KEY,
  test_run_id VARCHAR(191) NOT NULL,
  step_result_id VARCHAR(191),
  level ENUM('debug','info','warn','error') NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_logs_run FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_logs_step_result FOREIGN KEY (step_result_id) REFERENCES test_step_results(id)
);

CREATE TABLE attachments (
  id VARCHAR(191) PRIMARY KEY,
  test_run_id VARCHAR(191) NOT NULL,
  step_result_id VARCHAR(191),
  type ENUM('SCREENSHOT','VIDEO','TRACE','HTML_REPORT','PDF_REPORT','CSV_REPORT','DOWNLOAD','OTHER') NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  mime_type VARCHAR(150),
  size_bytes INT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attachments_run FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_attachments_step_result FOREIGN KEY (step_result_id) REFERENCES test_step_results(id)
);

