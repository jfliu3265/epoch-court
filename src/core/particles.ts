export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export class ParticlePool {
  readonly particles: Particle[] = [];

  emit(x: number, y: number, count: number, palette = ['#8fffe0', '#ffd96a', '#ffffff']): void {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 145;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 25,
        life: 0.5 + Math.random() * 0.9,
        maxLife: 1.4,
        size: 2 + Math.random() * 5,
        color: palette[index % palette.length] ?? '#fff',
      });
    }
  }

  update(delta: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]!;
      particle.life -= delta;
      if (particle.life <= 0) {
        this.particles.splice(index, 1);
        continue;
      }
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 55 * delta;
      particle.vx *= 0.988;
    }
  }

  render(context: CanvasRenderingContext2D): void {
    context.save();
    for (const particle of this.particles) {
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  clear(): void {
    this.particles.length = 0;
  }
}
