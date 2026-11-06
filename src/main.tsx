/**
 * 屏层入口。
 *
 * 刻意不套 React.StrictMode：借来的黑板组件用 lastScriptKey 防止同一条脚本重放，
 * 而 StrictMode 在开发模式下会"挂载 → 卸载 → 再挂载"，卸载时清掉了所有待执行的定时器，
 * 第二次挂载又被去重挡掉 —— 结果板子只画出第一笔就停住。
 * 那是 StrictMode 与组件内部去重策略的冲突，不是组件的 bug；这里按上游的用法不套 StrictMode。
 */

import { createRoot } from 'react-dom/client';
import App from './App';
import './features/skin/tokens.css';
import './features/skin/skin.css';

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 容器');

createRoot(container).render(<App />);
