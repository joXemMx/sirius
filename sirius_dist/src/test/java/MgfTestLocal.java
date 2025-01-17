import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;

public class MgfTestLocal {

    private static final String absPath = System.getProperty("user.dir").split("sirius_dist")[0];
    private static final String sep = System.getProperty("file.separator");
    private static final String temp_output = absPath + "sirius_cli/src/test/temp_results/mgf_temp_output/1_laudanosine_FEATURE_1/".replace("/", sep);
    private static final String temp_summary = absPath + "sirius_cli/src/test/temp_results/mgf_temp_summary/1_laudanosine_FEATURE_1/".replace("/", sep);

    @Test
    @DisplayName("Testing if SIRIUS calculates expected formula candidates with mgf file.")
    public void testTopCandidates() throws IOException {
        TestMethods.isDirExisting(temp_output + "canopus");
        TestMethods.isDirExisting(temp_output + "canopus_npc");
        TestMethods.isDirExisting(temp_output + "fingerid");
        TestMethods.isDirExisting(temp_output + "fingerprints");

        TestMethods.isDirNotEmpty(Paths.get(temp_output + "canopus"));
        TestMethods.isDirNotEmpty(Paths.get(temp_output + "canopus_npc"));
        TestMethods.isDirNotEmpty(Paths.get(temp_output + "fingerid"));
        TestMethods.isDirNotEmpty(Paths.get(temp_output + "fingerprints"));

        TestMethods.areContentsEqual(temp_output + "canopus", temp_output + "canopus_npc", temp_output + "fingerprints");


        int rank_count = 3;
        int table_feature = 1;
        String[] pre_formula = TestMethods.readCandidates(absPath + "sirius_cli/src/test/test_results/mgf_candidates/formula_candidates.tsv".replace("/", sep), rank_count, table_feature);
        String[] post_formula = TestMethods.readCandidates(temp_summary + "formula_candidates.tsv", rank_count, table_feature);

        rank_count = 3;
        table_feature = 6;
        String[] pre_structure = TestMethods.readCandidates(absPath + "sirius_cli/src/test/test_results/mgf_candidates/structure_candidates.tsv".replace("/", sep), rank_count, table_feature);
        String[] post_structure = TestMethods.readCandidates(temp_summary + "structure_candidates.tsv", rank_count, table_feature);

        assertArrayEquals(pre_formula, post_formula);
        assertArrayEquals(pre_structure, post_structure);
        System.out.println("MGF passed");
    }
}


