package lab;

import java.io.IOException;
import java.util.List;

import org.apache.lucene.analysis.standard.StandardAnalyzer;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.StringField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.store.ByteBuffersDirectory;
import org.apache.lucene.store.Directory;

public final class LuceneFuzzyLab {
    public enum Edit {
        MATCH, SUBSTITUTE, INSERT, DELETE, TRANSPOSE
    }

    public record Alignment(int distance, List<Edit> edits) {}
    public record Product(String id, String title) {}
    public record Hit(String id, String title, float score) {}

    private LuceneFuzzyLab() {}

    public static Alignment align(String source, String target) {
        // TODO: Damerau-Levenshtein distance and one optimal alignment
        throw new UnsupportedOperationException("implement align");
    }

    public static Directory buildIndex(List<Product> products) throws IOException {
        Directory directory = new ByteBuffersDirectory();
        try (IndexWriter writer = new IndexWriter(
                directory, new IndexWriterConfig(new StandardAnalyzer()))) {
            for (Product product : products) {
                Document document = new Document();
                document.add(new StringField("id", product.id(), Field.Store.YES));
                document.add(new TextField("title", product.title(), Field.Store.YES));
                writer.addDocument(document);
            }
        }
        return directory;
    }

    public static List<Hit> search(Directory directory, String text) throws IOException {
        // TODO: analyze query terms, combine FuzzyQuery clauses, and return ranked hits
        throw new UnsupportedOperationException("implement search");
    }
}
