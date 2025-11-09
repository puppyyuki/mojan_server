const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

(async () => {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  
  console.log('正在創建管理員帳號...');
  console.log('用戶名：', username);
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    // 檢查帳號是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });
    
    if (existingUser) {
      console.log('⚠️ 帳號已存在，請使用現有帳號登入');
      console.log('用戶名：', username);
      console.log('如果忘記密碼，請刪除現有帳號後重新創建');
      return;
    }
    
    // 創建新帳號
    const user = await prisma.user.create({
      data: {
        username: username,
        password: hashedPassword,
        role: 'ADMIN'
      }
    });
    
    console.log('✅ 管理員帳號創建成功！');
    console.log('用戶名：', username);
    console.log('密碼：', password);
    console.log('請使用以上帳號密碼登入管理面板');
  } catch (error) {
    if (error.code === 'P2002') {
      console.log('⚠️ 帳號已存在，請使用現有帳號登入');
      console.log('用戶名：', username);
    } else {
      console.error('❌ 創建帳號失敗：', error);
    }
  } finally {
    await prisma.$disconnect();
  }
})();

