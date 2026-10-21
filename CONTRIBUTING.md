# 参与贡献 / Contributing

感谢你帮助改进 TwinFiles。请先阅读 README 了解扫描边界。

## 报告问题

请提供操作系统、Node.js 版本、执行命令、预期和实际结果。尽量用虚构文件构造最小复现，不上传私人文件内容、真实目录清单、令牌或密钥。

## 修改代码

1. 修改前先说明具体问题；修复时保持工具离线、只读、无第三方依赖。
2. 用 `node --test` 验证。修复行为错误时，增加能够重现该问题的测试。
3. 修改 CLI、JSON 格式或用户可见行为时同步更新文档和 CHANGELOG。
4. Pull Request 写明改动理由、验证命令与平台；不要宣称未运行的检查已通过。

下一步可参与的方向：命令行进度展示、报告文本的语言选择、大目录扫描的内存占用改进。功能尚未实现。

For bug reports, include the OS, Node.js version, command, and a minimal reproduction using fictional files. Do not upload private reports or credentials. Run `node --test` before submitting changes and document which platforms you actually tested. Preserve offline behavior, read-only scanning, and zero third-party dependencies.
