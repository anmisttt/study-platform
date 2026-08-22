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
        # TODO: yield (url, 1) where url is whitespace field index 6 (7th token)
        raise NotImplementedError

    def combiner_count(self, url, counts):
        # TODO: local pre-aggregate — yield (url, sum(counts))
        raise NotImplementedError

    def reducer_count(self, url, counts):
        # TODO: yield (None, (total_count, url)) so step 2 sees one stream
        raise NotImplementedError

    def reducer_find_max(self, _, count_url_pairs):
        # TODO: yield max(count_url_pairs)  # pairs are (count, url)
        raise NotImplementedError


if __name__ == "__main__":
    MRTopURL.run()
