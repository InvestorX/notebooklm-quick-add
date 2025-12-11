# NotebookLM Quick Add 🍣

Google NotebookLMにウェブページ、YouTube動画、プレイリストをワンクリックで追加できるChrome拡張機能です。

## ✨ 機能

| 機能 | 説明 |
|------|------|
| 🌐 **ウェブページ追加** | 任意のウェブページをソースとして追加 |
| ▶️ **YouTube動画** | YouTube動画をメタデータ付きで追加 |
| 📋 **プレイリスト対応** | プレイリスト内の全動画を自動展開して追加 |
| 📝 **キュー機能** | URLを後でまとめて追加できるキュー |
| 📓 **ノートブック選択** | 追加先ノートブックを指定可能 |
| 🖱️ **右クリックメニュー** | コンテキストメニューから素早く追加 |

## 📦 インストール

1. このリポジトリをクローンまたはダウンロード
2. Chromeで `chrome://extensions/` を開く
3. 右上の「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. ダウンロードしたフォルダを選択

## 🚀 使い方

### ポップアップから追加

1. 追加したいページを開く
2. ツールバーの拡張機能アイコンをクリック
3. 追加先ノートブックを選択
4. 「今すぐ追加」または「キューに追加」をクリック

### キュー機能

1. 複数のページで「キューに追加」をクリック
2. キュータブで保存されたURLを確認
3. 「一括追加」でまとめてNotebookLMに追加

### 右クリックメニュー

- **NotebookLMに追加** → 今すぐ追加
- **キューに追加** → キューに保存

### YouTubeプレイリスト

プレイリストページで実行すると、全動画が個別のソースとして追加されます。

## 🔧 技術詳細

- **Manifest Version**: 3
- **権限**: `activeTab`, `storage`, `scripting`, `contextMenus`

## 📝 注意事項

- NotebookLMのUI変更により動作しなくなる可能性があります
- NotebookLMへのログインが必要です
- プレイリストの動画数が多い場合、追加に時間がかかります

## 🐛 トラブルシューティング

| 問題 | 解決方法 |
|------|----------|
| ソースが追加されない | NotebookLMにログインを確認、拡張機能を再読み込み |
| ノートブック一覧が空 | ポップアップの「更新」ボタンをクリック |
| プレイリストが検出されない | ページを再読み込みしてから再試行 |

## 📄 ライセンス

### 🍣 SUSHI-WARE LICENSE

```
"THE SUSHI-WARE LICENSE"
InvestorX wrote this extension.
As long as you retain this notice you can do whatever you want 
with this stuff. If we meet some day, and you think this stuff 
is worth it, you can buy me a sushi 🍣 in return.
```

## 🤝 コントリビューション

Issue報告やPull Requestを歓迎します！
