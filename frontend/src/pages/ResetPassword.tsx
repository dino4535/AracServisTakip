import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/authService';
import Button from '../components/common/Button';
import loginBg from '../assets/LoginBackround.jpg';
import logo from '../assets/logo.png';
import { toast } from 'react-hot-toast';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Geçersiz veya eksik şifre sıfırlama bağlantısı.');
      return;
    }

    if (!password || password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authService.resetPassword(token, password);
      toast.success(response.message || 'Şifreniz başarıyla güncellendi.');
      navigate('/login');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Şifre sıfırlanırken bir hata oluştu.');
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
            <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-md">Yeni Şifre Belirle</h1>
            <p className="text-white/90 drop-shadow">
              Lütfen hesabınız için yeni bir şifre belirleyin.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-white mb-2 drop-shadow-sm">
                Yeni Şifre
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent bg-white/20 text-white placeholder-white/60 backdrop-blur-sm transition-all hover:bg-white/30"
                placeholder="Yeni şifreniz"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2 drop-shadow-sm">
                Yeni Şifre (Tekrar)
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent bg-white/20 text-white placeholder-white/60 backdrop-blur-sm transition-all hover:bg-white/30"
                placeholder="Yeni şifrenizi tekrar girin"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-white px-4 py-3 rounded-lg backdrop-blur-sm">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-sm text-white/80 hover:text-white underline-offset-2 hover:underline"
              >
                Giriş ekranına dön
              </button>
              <Button
                type="submit"
                isLoading={isLoading}
                className="bg-white/90 text-primary-900 hover:bg-white border-0 shadow-lg font-bold"
              >
                Şifreyi Güncelle
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

