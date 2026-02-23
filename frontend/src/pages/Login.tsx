import { useState } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
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

            <Button type="submit" isLoading={isLoading} className="w-full bg-white/90 text-primary-900 hover:bg-white border-0 shadow-lg font-bold">
              Giriş Yap
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
