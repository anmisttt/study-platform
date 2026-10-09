import argparse
import re

import apache_beam as beam
from apache_beam.options.pipeline_options import PipelineOptions


def tokenize(line):
    # TODO: tokenize one input line
    raise NotImplementedError


class CountWords(beam.PTransform):
    def expand(self, lines):
        # TODO: build the word-count transform
        raise NotImplementedError


def format_count(item):
    # TODO: format one output record
    raise NotImplementedError


def run(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    known_args, pipeline_args = parser.parse_known_args(argv)
    options = PipelineOptions(pipeline_args)

    with beam.Pipeline(options=options) as pipeline:
        # TODO: connect the source, transform, and sink
        pass


if __name__ == "__main__":
    run()
