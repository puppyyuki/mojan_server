-- 分離「禁止遊戲」與「踢出」活動型別，避免解除禁止後被誤顯示成踢出
ALTER TYPE "ClubActivityType" ADD VALUE 'MEMBER_BANNED';
