import tempfile
import unittest
from pathlib import Path
from select_folder import find_existing


class ExistingTests(unittest.TestCase):
    def test_matches_exact_module_and_date_range(self):
        with tempfile.TemporaryDirectory() as root:
            month = Path(root) / '11月份'
            month.mkdir()
            names = [
                '【生意参谋平台】商品_全部_2026-11-22_2026-11-22.xls',
                '【生意参谋平台】无线店铺流量来源-2026-11-22_2026-11-22.xlsx',
                '光合_资产总览_作品分析_20261108至20261122_下载日期20261123_3a566e38cf623de2e9568fd695bbbc18.xls',
                '【生意参谋】选词助手-引流搜索词-店外-无线-20261116-20261122.xls',
            ]
            for name in names:
                (month / name).write_bytes(b'data')
            for stage, start, end, name in [
                ('product', '2026-11-22', '2026-11-22', names[0]),
                ('traffic', '2026-11-22', '2026-11-22', names[1]),
                ('content', '2026-11-08', '2026-11-22', names[2]),
                ('search', '2026-11-16', '2026-11-22', names[3]),
            ]:
                self.assertEqual(Path(find_existing(root, stage, start, end)).name, name)
            self.assertIsNone(find_existing(root, 'product', '2026-11-21', '2026-11-21'))
            self.assertIsNone(find_existing(root, 'content', '2026-11-09', '2026-11-22'))

    def test_missing_root_is_an_error(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(ValueError):
                find_existing(str(Path(root) / 'missing'), 'product', '2026-11-22', '2026-11-22')

if __name__ == '__main__':
    unittest.main()
