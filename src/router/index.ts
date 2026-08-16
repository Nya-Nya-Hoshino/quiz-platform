import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/Home.vue'),
      meta: { title: '首页' },
    },
    {
      path: '/jlpt',
      name: 'jlpt-home',
      component: () => import('../views/JLPTHome.vue'),
      meta: { title: 'JLPT 真题库' },
    },
    {
      path: '/jlpt/exam/:level/:examTitle',
      name: 'jlpt-exam',
      component: () => import('../views/JLPTExam.vue'),
      meta: { title: 'JLPT 真题考试' },
    },
    {
      path: '/jlpt/practice/:level/:examTitle',
      name: 'jlpt-practice',
      component: () => import('../views/JLPTPractice.vue'),
      meta: { title: 'JLPT 真题练习' },
    },
    {
      path: '/jlpt-result',
      name: 'jlpt-result',
      component: () => import('../views/JLPTResult.vue'),
      meta: { title: 'JLPT 考试结果' },
    },
    {
      path: '/exam/:id',
      name: 'exam',
      component: () => import('../views/Exam.vue'),
      meta: { title: '考试模式' },
    },
    {
      path: '/practice/:id',
      name: 'practice',
      component: () => import('../views/Practice.vue'),
      meta: { title: '练习模式' },
    },
    {
      path: '/result',
      name: 'result',
      component: () => import('../views/Result.vue'),
      meta: { title: '考试结果' },
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('../views/History.vue'),
      meta: { title: '历史记录' },
    },
    {
      path: '/wrong-book',
      name: 'wrong-book',
      component: () => import('../views/WrongBook.vue'),
      meta: { title: '错题本' },
    },
    {
      path: '/favorites',
      name: 'favorites',
      component: () => import('../views/Favorites.vue'),
      meta: { title: '收藏本' },
    },
    {
      path: '/notes',
      name: 'notes',
      component: () => import('../views/Notes.vue'),
      meta: { title: '笔记' },
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('../views/Search.vue'),
      meta: { title: '题目搜索' },
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('../views/Account.vue'),
      meta: { title: '账号中心' },
    },
    {
      path: '/wrong/:id',
      name: 'wrong-review',
      component: () => import('../views/WrongReview.vue'),
      meta: { title: '错题回顾' },
    },
    {
      path: '/notice',
      name: 'notice',
      component: () => import('../views/Notice.vue'),
      meta: { title: '站点公告' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/Settings.vue'),
      meta: { title: '设置' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · 刷题平台` : '刷题平台'
})

export default router
