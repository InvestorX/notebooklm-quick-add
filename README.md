# NotebookLM Quick Add - Chrome拡張機能

Google NotebookLMにウェブページ、YouTube動画、プレイリストを数クリックでデータソースとして追加できるChrome拡張機能です。

## ✨ 機能

- 🌐 **ウェブページ**: 任意のウェブページをソースとして追加
- ▶️ **YouTube動画**: YouTube動画をメタデータ付きで追加
- 📋 **YouTubeプレイリスト**: プレイリスト内の全動画を自動追加
- 📓 **ノートブック選択**: 任意のノートブックを選択して追加可能
- 🖱️ **右クリックメニュー**: コンテキストメニューから素早く追加
- ⚡ **ワンクリック追加**: シンプルで高速なワークフロー

## 📦 インストール方法

### 開発者モードでインストール

1. このリポジトリをクローンまたはダウンロード
2.  Chromeで `chrome://extensions/` を開く
3. 右上の「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. 拡張機能のディレクトリを選択
6. ツールバーに拡張機能アイコンが表示されます

### アイコンの生成

SVGからPNGアイコンを生成する場合：

```bash
# ImageMagickを使用
convert -background none icons/icon.svg -resize 16x16 icons/icon16.png
convert -background none icons/icon.svg -resize 32x32 icons/icon32.png
convert -background none icons/icon.svg -resize 48x48 icons/icon48. png
convert -background none icons/icon.svg -resize 128x128 icons/icon128.png
```

## 🚀 使い方

### ポップアップから追加

1. 追加したいページ（ウェブページ、YouTube動画、プレイリスト）を開く
2. ツールバーの拡張機能アイコンをクリック
3. 追加先のノートブックを選択（または新規作成）
4.  「NotebookLMに追加」ボタンをクリック

### 右クリックメニューから追加

1. 任意のページで右クリック
2. 「NotebookLMに追加」を選択
3. サブメニューから追加先ノートブックを選択

### YouTubeプレイリスト

プレイリストページまたはプレイリスト内の動画ページで実行すると、プレイリスト内の**全動画**が自動的にNotebookLMに追加されます。

## ⚙️ 設定

### ノートブック一覧の更新

1. NotebookLMを一度開く（ノートブック一覧が自動取得されます）
2. または、ポップアップの更新ボタン（↻）をクリック

## 🔧 技術詳細

- **Manifest Version**: 3
- **権限**:
  - `activeTab`: 現在のタブへのアクセス
  - `storage`: 設定とキャッシュの保存
  - `scripting`: コンテンツスクリプトの注入
  - `contextMenus`: 右クリックメニュー

## 📝 注意事項

- NotebookLMのUI変更により、ソース追加機能が動作しなくなる可能性があります
- プレイリストの動画数が多い場合、追加に時間がかかることがあります
- NotebookLMにログイン済みである必要があります

## 🐛 トラブルシューティング

### ソースが追加されない場合

1. NotebookLMにログインしているか確認
2. 拡張機能を再読み込み
3. ブラウザを再起動

### ノートブック一覧が表示されない場合

1.  NotebookLMのページを開く
2. ポップアップの更新ボタンをクリック

## 📄 ライセンス

MIT License

## 🤝 コントリビューション

Issue報告やPull Requestを歓迎します！
