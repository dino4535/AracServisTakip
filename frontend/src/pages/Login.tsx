import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/common/Button';
import loginBg from '../assets/LoginBackround.jpg';
import logo from '../assets/logo.png';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    const savedPassword = localStorage.getItem('rememberedPassword');
    if (savedEmail && savedPassword) {
      setEmail(savedEmail);
      setPassword(savedPassword);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
        localStorage.setItem('rememberedPassword', password);
      } else {
        localStorage.removeItem('rememberedEmail');
        localStorage.removeItem('rememberedPassword');
      }

      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-cover bg-center flex items-center justify-center p-4 relative"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      <div className="absolute inset-0 bg-black bg-opacity-50"></div>
      <div className="max-w-md w-full relative z-10 animate-glass-reveal">
        <div className="glass-panel rounded-2xl p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img src={logo} alt="Logo" className="h-24 object-contain drop-shadow-lg" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-md">Araç Servis Takip</h1>
            <p className="text-white/90 font-medium drop-shadow">Dino Gıda & Bermer Araç Yönetim Portalı</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-white mb-2 drop-shadow-sm">
                E-posta
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent bg-white/20 text-white placeholder-white/60 backdrop-blur-sm transition-all hover:bg-white/30"
                placeholder="ornek@dino.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2 drop-shadow-sm">
                Şifre
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent bg-white/20 text-white placeholder-white/60 backdrop-blur-sm transition-all hover:bg-white/30"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-white px-4 py-3 rounded-lg backdrop-blur-sm">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-white focus:ring-white border-white/30 rounded bg-white/20 checked:bg-white checked:text-primary-900 cursor-pointer"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-white drop-shadow-sm cursor-pointer select-none">
                  Beni Hatırla
                </label>
              </div>
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-sm text-white/80 hover:text-white underline-offset-2 hover:underline"
              >
                Şifremi unuttum
              </button>
            </div>

            <Button
              type="submit"
              isLoading={isLoading}
              className="w-full bg-white/90 text-primary-900 hover:bg-white border-0 shadow-lg font-bold"
            >
              Giriş Yap
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
