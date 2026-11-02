// Screens shown before the notebook: loading, sign-in, waiting for approval.
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { session, signIn, signOut } from '@/store/auth'

const AUTH_ERRORS = {
  'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
  'auth/unauthorized-domain': '이 주소에서는 로그인할 수 없어요.',
  'auth/popup-blocked': '팝업이 막혔어요. 다시 눌러 주세요.',
  'permission-denied': '권한이 없어요.',
}

export function Splash({ text = '불러오는 중' }) {
  return (
    <div className="gate"><div className="box">
      <img className="logo" src="/icons/logo-256.png" alt="hy" />
      <div className="row" style={{ justifyContent: 'center' }}><Spinner className="size-5 text-mute" /><span className="muted">{text}</span></div>
    </div></div>
  )
}

export function Login() {
  return (
    <div className="gate"><div className="box">
      <img className="logo" src="/icons/logo-256.png" alt="hy" />
      <h1>헬리오 배달수첩</h1>
      <p className="muted" style={{ margin: 0 }}>Google 계정으로 로그인해요. 처음 로그인하면 승인을 받은 뒤에 쓸 수 있어요.</p>
      <Button variant="primary" size="lg" className="w-full" onClick={() => signIn()}>Google로 로그인</Button>
      {session.error && <p className="warnbox" style={{ margin: 0 }}>{AUTH_ERRORS[session.error] || `로그인하지 못했어요 (${session.error})`}</p>}
    </div></div>
  )
}

export function Waiting() {
  const rejected = session.status === 'rejected'
  const email = session.user?.email
  return (
    <div className="gate"><div className="box">
      <img className="logo" src="/icons/logo-256.png" alt="hy" />
      <h1>{rejected ? '사용할 수 없는 계정이에요' : '승인을 기다리고 있어요'}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {rejected
          ? `${email} 계정은 승인되지 않았어요.`
          : `${email} 계정으로 가입했어요. 관리자가 승인하면 이 화면이 자동으로 바뀌어요.`}
      </p>
      <Button className="w-full" onClick={() => signOut()}>다른 계정으로 로그인</Button>
    </div></div>
  )
}
