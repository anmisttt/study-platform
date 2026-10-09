#!/usr/bin/env python3
"""Two-step mrjob: count URLs, then pick the global max."""
from mrjob.job import MRJob
from mrjob.step import MRStep


class MRTopURL(MRJob):
    def steps(self):
        return [
            MRStep(
                mapper=self.mapper_get_url,
                combiner=self.combiner_count,
                reducer=self.reducer_count,
            ),
            MRStep(reducer=self.reducer_find_max),
        ]

    def mapper_get_url(self, _, line):
        # TODO: parse the request URL
        raise NotImplementedError

    def combiner_count(self, url, counts):
        # TODO: combine URL counts
        raise NotImplementedError

    def reducer_count(self, url, counts):
        # TODO: aggregate and re-key URL counts
        raise NotImplementedError

    def reducer_find_max(self, _, count_url_pairs):
        # TODO: select the global maximum
        raise NotImplementedError


if __name__ == "__main__":
    MRTopURL.run()
