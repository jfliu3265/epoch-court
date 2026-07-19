import './styles.css';
import { GameApp } from './game/app';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('应用挂载点不存在');

const app = new GameApp(root);
void app.initialize();
