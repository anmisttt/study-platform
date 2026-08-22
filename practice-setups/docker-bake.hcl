variable "REGISTRY" { default = "ghcr.io/anmisttt" }
variable "BASE_PKG" { default = "ddia-practice-base" }
variable "TASK_PKG" { default = "ddia-practice" }
variable "TAG_SUFFIX" { default = "" }

group "default" {
  targets = [
    "base-pg16",
    "task-ch8-p0",
    "task-ch8-p1",
    "task-ch8-p2",
    "task-ch8-p3",
    "task-ch8-p4",
    "task-ch8-p5",
    "task-ch11-p2",
    "task-ch11-p4",
    "task-ch5-p0",
    "task-ch5-p1",
    "task-ch5-p2",
    "task-ch5-p5",
    "task-ch1-p0",
    "task-ch4-p0",
    "task-ch4-p1",
    "task-ch4-p2",
    "task-ch4-p3",
    "task-ch4-p4",
    "task-ch9-p0",
    "task-ch9-p1",
    "task-ch7-p4",
    "task-ch7-p5",
    "task-ch7-p6",
    "task-ch6-p3",
    "task-ch6-p4",
    "task-ch10-p5",
    "task-ch3-p1",
    "task-ch3-p2",
    "task-ch3-p3",
    "task-ch3-p4",
    "task-ch3-p5",
    "task-ch3-p6",
    "task-ch3-p7",
    "task-ch13-p0",
    "task-ch13-p1",
    "task-ch13-p2",
    "task-ch12-p0",
    "task-ch12-p1",
    "task-ch12-p2",
    "task-ch12-p3",
    "task-ch12-p4",
  ]
}

target "base-pg16" {
  context = "bases/pg16"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${BASE_PKG}:pg16${TAG_SUFFIX}"]
}

target "task-ch8-p0" {
  context = "tasks/ch8-p0"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch8-p0${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch8-p1" {
  context = "tasks/ch8-p1"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch8-p1${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch8-p2" {
  context = "tasks/ch8-p2"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch8-p2${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch8-p3" {
  context = "tasks/ch8-p3"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch8-p3${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch8-p4" {
  context = "tasks/ch8-p4"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch8-p4${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch8-p5" {
  context = "tasks/ch8-p5"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch8-p5${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch11-p2" {
  context = "tasks/ch11-p2"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch11-p2${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch11-p4" {
  context = "tasks/ch11-p4"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch11-p4${TAG_SUFFIX}"]

}

target "task-ch5-p0" {
  context = "tasks/ch5-p0"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch5-p0${TAG_SUFFIX}"]

}

target "task-ch5-p1" {
  context = "tasks/ch5-p1"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch5-p1${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch5-p2" {
  context = "tasks/ch5-p2"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch5-p2${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch5-p5" {
  context = "tasks/ch5-p5"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch5-p5${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch1-p0" {
  context = "tasks/ch1-p0"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch1-p0${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch4-p0" {
  context = "tasks/ch4-p0"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch4-p0${TAG_SUFFIX}"]

}

target "task-ch4-p1" {
  context = "tasks/ch4-p1"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch4-p1${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch4-p2" {
  context = "tasks/ch4-p2"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch4-p2${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch4-p3" {
  context = "tasks/ch4-p3"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch4-p3${TAG_SUFFIX}"]

}

target "task-ch4-p4" {
  context = "tasks/ch4-p4"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch4-p4${TAG_SUFFIX}"]

}

target "task-ch9-p0" {
  context = "tasks/ch9-p0"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch9-p0${TAG_SUFFIX}"]

}

target "task-ch9-p1" {
  context = "tasks/ch9-p1"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch9-p1${TAG_SUFFIX}"]

}

target "task-ch7-p4" {
  context = "tasks/ch7-p4"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch7-p4${TAG_SUFFIX}"]

}

target "task-ch7-p5" {
  context = "tasks/ch7-p5"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch7-p5${TAG_SUFFIX}"]

}

target "task-ch7-p6" {
  context = "tasks/ch7-p6"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch7-p6${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch6-p3" {
  context = "tasks/ch6-p3"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch6-p3${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch6-p4" {
  context = "tasks/ch6-p4"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch6-p4${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch10-p5" {
  context = "tasks/ch10-p5"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch10-p5${TAG_SUFFIX}"]

}

target "task-ch3-p1" {
  context = "tasks/ch3-p1"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch3-p1${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch3-p2" {
  context = "tasks/ch3-p2"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch3-p2${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch3-p3" {
  context = "tasks/ch3-p3"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch3-p3${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch3-p4" {
  context = "tasks/ch3-p4"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch3-p4${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch3-p5" {
  context = "tasks/ch3-p5"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch3-p5${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch3-p6" {
  context = "tasks/ch3-p6"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch3-p6${TAG_SUFFIX}"]

}

target "task-ch3-p7" {
  context = "tasks/ch3-p7"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch3-p7${TAG_SUFFIX}"]

}

target "task-ch13-p0" {
  context = "tasks/ch13-p0"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch13-p0${TAG_SUFFIX}"]

}

target "task-ch13-p1" {
  context = "tasks/ch13-p1"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch13-p1${TAG_SUFFIX}"]

}

target "task-ch13-p2" {
  context = "tasks/ch13-p2"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch13-p2${TAG_SUFFIX}"]

}

target "task-ch12-p0" {
  context = "tasks/ch12-p0"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch12-p0${TAG_SUFFIX}"]

}

target "task-ch12-p1" {
  context = "tasks/ch12-p1"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch12-p1${TAG_SUFFIX}"]

}

target "task-ch12-p2" {
  context = "tasks/ch12-p2"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch12-p2${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch12-p3" {
  context = "tasks/ch12-p3"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch12-p3${TAG_SUFFIX}"]
args = {
  BASE_IMAGE = "${REGISTRY}/${BASE_PKG}:pg16"
}
depends_on = ["base-pg16"]
}

target "task-ch12-p4" {
  context = "tasks/ch12-p4"
  dockerfile = "Dockerfile"
  tags = ["${REGISTRY}/${TASK_PKG}:ch12-p4${TAG_SUFFIX}"]

}

