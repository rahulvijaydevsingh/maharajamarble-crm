import json, sys, tempfile, unittest, zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from finalize_nightly_backup import BackupFinalizeError, build_archive, verify_archive


class FinalizeArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        (self.source / "tables").mkdir(parents=True)
        self.tables = ["leads", "activity_log"]
        (self.source / "manifest.json").write_text(json.dumps({
            "integrity_status": "valid", "tableCount": 2, "tables": self.tables
        }), encoding="utf-8")
        for table in self.tables:
            (self.source / "tables" / f"{table}.json").write_text("[]", encoding="utf-8")
            (self.source / "tables" / f"{table}.csv").write_text("\\n", encoding="utf-8")
        self.archive = self.root / "backup.zip"

    def tearDown(self):
        self.temp.cleanup()

    def test_build_and_verify_complete_archive(self):
        build_archive(self.archive, self.source, self.tables)
        verify_archive(self.archive, self.tables)
        with zipfile.ZipFile(self.archive) as archive:
            self.assertEqual(len(archive.namelist()), 5)

    def test_rejects_missing_raw_table_file(self):
        (self.source / "tables" / "activity_log.csv").unlink()
        with self.assertRaises(BackupFinalizeError):
            build_archive(self.archive, self.source, self.tables)

    def test_rejects_manifest_table_mismatch(self):
        (self.source / "manifest.json").write_text(json.dumps({
            "integrity_status": "valid", "tableCount": 1, "tables": ["leads"]
        }), encoding="utf-8")
        with self.assertRaises(BackupFinalizeError):
            build_archive(self.archive, self.source, self.tables)

    def test_rejects_missing_archive_member(self):
        build_archive(self.archive, self.source, self.tables)
        incomplete = self.root / "incomplete.zip"
        with zipfile.ZipFile(incomplete, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", (self.source / "manifest.json").read_bytes())
        with self.assertRaises(BackupFinalizeError):
            verify_archive(incomplete, self.tables)


if __name__ == "__main__":
    unittest.main()
