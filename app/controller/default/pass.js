'use strict';

const Controller = require('egg').Controller;

class PassController extends Controller {

  // 登录
  async login() {
    await this.ctx.render('default/pass/login.html');
  }


  async doLogin() {
    const username = this.ctx.request.body.username;
    let password = this.ctx.request.body.password;
    const identify_code = this.ctx.request.body.identify_code;

    if (identify_code != this.ctx.session.identify_code) {

      // 重新生成验证码 为了安全
      var captcha = await this.service.tools.captcha(120, 50);
      this.ctx.session.identify_code = captcha.text;

      this.ctx.body = {
        success: false,
        msg: '输入的图形验证码不正确',
      };


    } else {

      password = await this.service.tools.md5(password);

      const userResult = await this.ctx.model.User.find({ phone: username, password }, '_id phone last_ip add_time email status');

      if (userResult.length) {

        // cookies 安全      加密
        this.service.cookies.set('userinfo', userResult[0]);
        this.ctx.body = {
          success: true,
          msg: '登录成功',
        };
      } else {

        // 重新生成验证码
        var captcha = await this.service.tools.captcha(120, 50);
        this.ctx.session.identify_code = captcha.text;

        this.ctx.body = {
          success: false,
          msg: '用户名或者密码错误',
        };
      }


    }


  }


  // 退出登录
  async loginOut() {

    this.service.cookies.set('userinfo', '');

    this.ctx.redirect('/');
  }
  // 注册第一步 输入手机号
  async registerStep1() {
    await this.ctx.render('default/pass/register_step1.html');
  }
  // 注册第二步  验证码验证码是否正确
  async registerStep2() {


    const sign = this.ctx.request.query.sign;
    const identify_code = this.ctx.request.query.identify_code;
    const add_day = await this.service.tools.getDay(); // 年月日
    const userTempResult = await this.ctx.model.UserTemp.find({ sign, add_day });

    if (userTempResult.length == 0) {

      this.ctx.redirect('/register/registerStep1');
    } else {
      await this.ctx.render('default/pass/register_step2.html', {
        sign,
        phone: userTempResult[0].phone,
        identify_code,
      });
    }

  }
  // 注册第三步  输入密码
  async registerStep3() {

    const sign = this.ctx.request.query.sign;
    const phone_code = this.ctx.request.query.phone_code;
    const msg = this.ctx.request.query.msg || '';
    const add_day = await this.service.tools.getDay(); // 年月日
    const userTempResult = await this.ctx.model.UserTemp.find({ sign, add_day });

    if (userTempResult.length == 0) {

      this.ctx.redirect('/register/registerStep1');
    } else {


      await this.ctx.render('default/pass/register_step3.html', {
        sign,
        phone_code,
        msg,
      });
    }


  }


  // 完成注册  post
  async doRegister() {

    const sign = this.ctx.request.body.sign;
    const phone_code = this.ctx.request.body.phone_code;
    const add_day = await this.service.tools.getDay(); // 年月日
    const password = this.ctx.request.body.password;

    const rpassword = this.ctx.request.body.rpassword;


    const ip = this.ctx.request.ip.replace(/::ffff:/, '');

    if (this.ctx.session.phone_code != phone_code) {
      // 非法操作
      this.ctx.redirect('/pass/registerStep1');
    }

    const userTempResult = await this.ctx.model.UserTemp.find({ sign, add_day });

    if (userTempResult.length == 0) {
      // 非法操作
      this.ctx.redirect('/pass/registerStep1');
    } else {

      // 传入参数正确 执行增加操作

      if (password.length < 6 || password != rpassword) {
        const msg = '密码不能小于6位并且密码和确认密码必须一致';
        this.ctx.redirect('/register/registerStep3?sign=' + sign + '&phone_code=' + phone_code + '&msg=' + msg);
      } else {
        const userModel = new this.ctx.model.User({
          phone: userTempResult[0].phone,
          password: await this.service.tools.md5(password),
          last_ip: ip,
        });
        // 保存用户
        const userReuslt = await userModel.save();

        if (userReuslt) {

          // 获取用户信息

          const userinfo = await this.ctx.model.User.find({ phone: userTempResult[0].phone }, '_id phone last_ip add_time email status');

          // 用户注册成功以后默认登录

          // cookies 安全      加密
          this.service.cookies.set('userinfo', userinfo[0]);

          this.ctx.redirect('/');
        }

      }

    }


  }
  // 验证验证码

  async validatePhoneCode() {

    const sign = this.ctx.request.query.sign;
    const phone_code = this.ctx.request.query.phone_code;
    const add_day = await this.service.tools.getDay(); // 年月日


    if (this.ctx.session.phone_code != phone_code) {
      this.ctx.body = {
        success: false,
        msg: '您输入的手机验证码错误',
      };
    } else {

      const userTempResult = await this.ctx.model.UserTemp.find({ sign, add_day });
      if (userTempResult.length <= 0) {
        this.ctx.body = {
          success: false,
          msg: '参数错误',
        };

      } else {

        // 判断验证码是否超时
        const nowTime = await this.service.tools.getTime();
        if ((userTempResult[0].add_time - nowTime) / 1000 / 60 > 30) {
          this.ctx.body = {
            success: false,
            msg: '验证码已经过期',
          };
        } else {
          // 用户表有没有当前这个手机号        手机号有没有注册
          const userResult = await this.ctx.model.User.find({ phone: userTempResult[0].phone });
          if (userResult.length > 0) {
            this.ctx.body = {
              success: false,
              msg: '此用户已经存在',
            };
          } else {
            this.ctx.body = {
              success: true,
              msg: '验证码输入正确',
              sign,
            };
          }

        }

      }


    }


  }


  // 发送短信验证码
  async sendCode() {

    const phone = this.ctx.request.query.phone;
    const identify_code = this.ctx.request.query.identify_code; // 用户输入的验证码

    if (identify_code != this.ctx.session.identify_code) {

      this.ctx.body = {
        success: false,
        msg: '输入的图形验证码不正确',
      };
    } else {

      // 判断手机格式是否合法
      const reg = /^[\d]{11}$/;
      if (!reg.test(phone)) {
        this.ctx.body = {
          success: false,
          msg: '手机号不合法',
        };
      } else {

        const add_day = await this.service.tools.getDay(); // 年月日
        const add_time = await this.service.tools.getTime(); // 增加时间
        const sign = await this.service.tools.md5(phone + add_day); // 签名
        const ip = this.ctx.request.ip.replace(/::ffff:/, ''); // 获取客户端ip
        const phone_code = await this.service.tools.getRandomNum(); // 发送短信的随机码

        const userTempResult = await this.ctx.model.UserTemp.find({ sign, add_day });

        // 1个ip 一天只能发20个手机号
        const ipCount = await this.ctx.model.UserTemp.find({ ip, add_day }).count();


        if (userTempResult.length > 0) {
          if (userTempResult[0].send_count < 6 && ipCount < 10) { // 执行发送
            const send_count = userTempResult[0].send_count + 1;
            await this.ctx.model.UserTemp.updateOne({ _id: userTempResult[0]._id }, { send_count, add_time });

            // 发送短信
            // this.service.sendCode.send(phone,'随机验证码')
            this.ctx.session.phone_code = phone_code;
            console.log('---------------------------------');
            console.log(phone_code, ipCount);

            this.ctx.body = {
              success: true,
              msg: '短信发送成功',
              sign,
            };


          } else {
            this.ctx.body = { success: false, msg: '当前手机号码发送次数达到上限，明天重试' };

          }

        } else {
          const userTmep = new this.ctx.model.UserTemp({
            phone,
            add_day,
            sign,
            ip,
            send_count: 1,
          });
          userTmep.save();
          // 发送短信
          // this.service.sendCode.send(phone,'随机验证码')
          this.ctx.session.phone_code = phone_code;
          this.ctx.body = {
            success: true,
            msg: '短信发送成功',
            sign,
          };

        }

      }

    }

  }

}

module.exports = PassController;
