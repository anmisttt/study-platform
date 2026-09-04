variable "REGISTRY" { default = "ghcr.io" }
variable "IMAGE_OWNER" { default = "anmisttt" }
variable "TASK_PKG" { default = "lab" }
variable "TAG_SUFFIX" { default = "" }

# These two lists are the complete image inventory.
variable "POSTGRES_TASKS" {
  default = [
    { tag = "ch1-p1", db = "retail_lab" },
    { tag = "ch3-p4", db = "lab" },
    { tag = "ch3-p5", db = "lab" },
    { tag = "ch4-p2", db = "messages_index_lab" },
    { tag = "ch4-p3", db = "index_shape_lab" },
    { tag = "ch5-p2", db = "lab" },
    { tag = "ch5-p3", db = "lab" },
    { tag = "ch5-p6", db = "lab" },
    { tag = "ch6-p4", db = "lab" },
    { tag = "ch6-p5", db = "lab" },
    { tag = "ch7-p7", db = "ch7_rls_lab" },
    { tag = "ch8-p1", db = "ch8_txns" },
    { tag = "ch8-p2", db = "lab" },
    { tag = "ch8-p3", db = "ch8_seats" },
    { tag = "ch8-p4", db = "lab" },
    { tag = "ch8-p5", db = "lab" },
    { tag = "ch8-p6", db = "ch8_2pc_lab" },
    { tag = "ch11-p3", db = "batch_join_lab" },
    { tag = "ch12-p3", db = "ch12_cdc_lab" },
    { tag = "ch12-p4", db = "ch12_views_lab" },
  ]
}

variable "PYTHON_DELIVERY_TASKS" {
  default = [
    { tag = "ch3-p1", apt = "" },
    { tag = "ch3-p3", apt = "" },
    { tag = "ch3-p6", apt = "" },
    { tag = "ch3-p7", apt = "" },
    { tag = "ch4-p1", apt = "" },
    { tag = "ch4-p4", apt = "" },
    { tag = "ch4-p5", apt = "" },
    { tag = "ch5-p1", apt = "" },
    { tag = "ch7-p5", apt = "" },
    { tag = "ch7-p6", apt = "" },
    { tag = "ch9-p1", apt = "iproute2 iptables curl procps" },
    { tag = "ch9-p2", apt = "iproute2 tcpdump curl procps" },
    { tag = "ch10-p6", apt = "" },
    { tag = "ch11-p5", apt = "" },
    { tag = "ch12-p1", apt = "" },
    { tag = "ch12-p2", apt = "" },
    { tag = "ch12-p5", apt = "" },
    { tag = "ch13-p1", apt = "" },
    { tag = "ch13-p2", apt = "" },
    { tag = "ch13-p3", apt = "" },
  ]
}

variable "NODE_PYTHON_DELIVERY_TASKS" {
  default = [
    { tag = "ch3-p2" },
  ]
}

group "default" {
  targets = ["postgres-task", "python-delivery-task", "node-python-delivery-task"]
}

target "_common" {
  labels = {
    "org.opencontainers.image.source" = "https://github.com/anmisttt/study-platform"
  }
}

target "postgres-task" {
  inherits = ["_common"]
  name = "task-${item.tag}"
  matrix = {
    item = POSTGRES_TASKS
  }
  context = "."
  dockerfile = "images/postgres.Dockerfile"
  args = {
    POSTGRES_DB = item.db
  }
  contexts = {
    task = "tasks/${item.tag}"
  }
  tags = ["${REGISTRY}/${IMAGE_OWNER}/${TASK_PKG}:${item.tag}${TAG_SUFFIX}"]
}

target "python-delivery-task" {
  inherits = ["_common"]
  name = "task-${item.tag}"
  matrix = {
    item = PYTHON_DELIVERY_TASKS
  }
  context = "."
  dockerfile = "images/python-delivery.Dockerfile"
  args = {
    APT_PACKAGES = item.apt
  }
  contexts = {
    task = "tasks/${item.tag}"
  }
  tags = ["${REGISTRY}/${IMAGE_OWNER}/${TASK_PKG}:${item.tag}${TAG_SUFFIX}"]
}

target "node-python-delivery-task" {
  inherits = ["_common"]
  name = "task-${item.tag}"
  matrix = {
    item = NODE_PYTHON_DELIVERY_TASKS
  }
  context = "."
  dockerfile = "images/node-delivery.Dockerfile"
  contexts = {
    task = "tasks/${item.tag}"
  }
  tags = ["${REGISTRY}/${IMAGE_OWNER}/${TASK_PKG}:${item.tag}${TAG_SUFFIX}"]
}
