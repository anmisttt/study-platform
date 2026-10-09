import apache_beam as beam
from apache_beam.testing.test_pipeline import TestPipeline
from apache_beam.testing.util import assert_that, equal_to

from beam_wordcount import CountWords, format_count


def test_word_count_output():
    with TestPipeline() as pipeline:
        actual = (
            pipeline
            | beam.Create([
                "Alpha, beta alpha!",
                "gamma beta",
                "ALPHA",
            ])
            | CountWords()
            | beam.Map(format_count)
        )
        assert_that(actual, equal_to(["alpha\t3", "beta\t2", "gamma\t1"]))


if __name__ == "__main__":
    test_word_count_output()
    print("tests passed")
