module.exports = {
  apps: [
    {
      name: 'eyewitness-producer',
      script: 'src/producer.ts',
      interpreter: 'ts-node',
      watch: false,
      env: { NODE_ENV: 'production' },
      restart_delay: 5000,
      max_restarts: 10,
    },
    {
      name: 'eyewitness-worker',
      script: 'src/worker.ts',
      interpreter: 'ts-node',
      instances: 3,
      exec_mode: 'fork',  // ts-node does not support cluster mode
      watch: false,
      env: { NODE_ENV: 'production' },
      restart_delay: 5000,
      max_restarts: 10,
    },
    {
      name: 'eyewitness-monitor',
      script: 'src/monitor.ts',
      interpreter: 'ts-node',
      watch: false,
      env: { NODE_ENV: 'production' },
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
}
