variable "REGISTRY" { default = "ghcr.io" }
variable "IMAGE_OWNER" { default = "anmisttt" }
variable "BASE_PKG" { default = "ddia-practice-base" }
variable "TASK_PKG" { default = "ddia-practice" }
variable "TAG_SUFFIX" { default = "" }

# These two lists are the complete image inventory.
variable "POSTGRES_TASKS" {
  default = [
    { tag = "ch1-p0", db = "retail_lab" },
    { tag = "ch3-p4", db = "lab" },
    { tag = "ch3-p5", db = "lab" },
    { tag = "ch4-p1", db = "messages_index_lab" },
    { tag = "ch4-p2", db = "index_shape_lab" },
    { tag = "ch5-p1", db = "lab" },
    { tag = "ch5-p2", db = "lab" },
    { tag = "ch5-p5", db = "lab" },
    { tag = "ch6-p3", db = "lab" },
    { tag = "ch6-p4", db = "lab" },
    { tag = "ch7-p6", db = "ch7_rls_lab" },
    { tag = "ch8-p0", db = "ch8_txns" },
    { tag = "ch8-p1", db = "lab" },
    { tag = "ch8-p2", db = "ch8_seats" },
    { tag = "ch8-p3", db = "lab" },
    { tag = "ch8-p4", db = "lab" },
    { tag = "ch8-p5", db = "ch8_2pc_lab" },
    { tag = "ch11-p2", db = "batch_join_lab" },
    { tag = "ch12-p2", db = "ch12_cdc_lab" },
    { tag = "ch12-p3", db = "ch12_views_lab" },
  ]
}

variable "DELIVERY_TASKS" {
  default = [
    { tag = "ch3-p1", apt = "" },
    { tag = "ch3-p3", apt = "" },
    { tag = "ch3-p6", apt = "" },
    { tag = "ch3-p7", apt = "" },
    { tag = "ch4-p0", apt = "" },
    { tag = "ch4-p3", apt = "" },
    { tag = "ch4-p4", apt = "" },
    { tag = "ch5-p0", apt = "" },
    { tag = "ch7-p4", apt = "" },
    { tag = "ch7-p5", apt = "" },
    { tag = "ch9-p0", apt = "iproute2 iptables curl procps" },
    { tag = "ch9-p1", apt = "iproute2 tcpdump curl procps" },
    { tag = "ch10-p5", apt = "" },
    { tag = "ch11-p4", apt = "" },
    { tag = "ch12-p0", apt = "" },
    { tag = "ch12-p1", apt = "" },
    { tag = "ch12-p4", apt = "" },
    { tag = "ch13-p0", apt = "" },
    { tag = "ch13-p1", apt = "" },
    { tag = "ch13-p2", apt = "" },
  ]
}

variable "NODE_DELIVERY_TASKS" {
  default = [
    { tag = "ch3-p2" },
  ]
}

group "default" {
  targets = ["base-pg16", "postgres-task", "delivery-task", "node-delivery-task"]
}

target "base-pg16" {
  context = "bases/pg16"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${IMAGE_OWNER}/${BASE_PKG}:pg16${TAG_SUFFIX}"]
}

target "postgres-task" {
  name = "task-${item.tag}"
  matrix = {
    item = POSTGRES_TASKS
  }
  context = "."
  dockerfile = "images/postgres.Dockerfile"
  args = {
    BASE_IMAGE = "base"
    POSTGRES_DB = item.db
  }
  contexts = {
    base = "target:base-pg16"
    task = "tasks/${item.tag}"
  }
  tags = ["${REGISTRY}/${IMAGE_OWNER}/${TASK_PKG}:${item.tag}${TAG_SUFFIX}"]
}

target "delivery-task" {
  name = "task-${item.tag}"
  matrix = {
    item = DELIVERY_TASKS
  }
  context = "."
  dockerfile = "images/delivery.Dockerfile"
  args = {
    APT_PACKAGES = item.apt
  }
  contexts = {
    task = "tasks/${item.tag}"
  }
  tags = ["${REGISTRY}/${IMAGE_OWNER}/${TASK_PKG}:${item.tag}${TAG_SUFFIX}"]
}

target "node-delivery-task" {
  name = "task-${item.tag}"
  matrix = {
    item = NODE_DELIVERY_TASKS
  }
  context = "."
  dockerfile = "images/node-delivery.Dockerfile"
  contexts = {
    task = "tasks/${item.tag}"
  }
  tags = ["${REGISTRY}/${IMAGE_OWNER}/${TASK_PKG}:${item.tag}${TAG_SUFFIX}"]
}
